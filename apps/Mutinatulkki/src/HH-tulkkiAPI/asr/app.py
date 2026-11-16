from __future__ import annotations

import base64
import gc
import json
import os
import re
import tempfile
import time
from pathlib import Path
from threading import Lock, Thread
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse


SERVICE_NAME = "mutinat-tulkki"
MODEL_NAME = os.getenv("ASR_MODEL", "Finnish-NLP/whisper-large-finnish-v3-ct2")
DEVICE = os.getenv("ASR_DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("ASR_COMPUTE_TYPE", "float16")
LANGUAGE = os.getenv("ASR_LANGUAGE", "fi")
TASK = os.getenv("ASR_TASK", "transcribe")
BEAM_SIZE = int(os.getenv("ASR_BEAM_SIZE", "5"))
BEST_OF = int(os.getenv("ASR_BEST_OF", "5"))
VAD_FILTER = os.getenv("ASR_VAD_FILTER", "1").strip().lower() not in {"0", "false", "no", "off"}
WORD_TIMESTAMPS = os.getenv("ASR_WORD_TIMESTAMPS", "0").strip().lower() not in {"0", "false", "no", "off"}
RETRY_ENABLED = os.getenv("ASR_RETRY_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
RETRY_BEAM_SIZE = max(BEAM_SIZE, int(os.getenv("ASR_RETRY_BEAM_SIZE", "8")))
RETRY_VAD_FILTER = os.getenv("ASR_RETRY_VAD_FILTER", "1").strip().lower() not in {"0", "false", "no", "off"}
RETRY_LOW_AVG_LOGPROB = float(os.getenv("ASR_RETRY_LOW_AVG_LOGPROB", "-0.85"))
RETRY_HIGH_NO_SPEECH_PROBABILITY = float(os.getenv("ASR_RETRY_HIGH_NO_SPEECH_PROBABILITY", "0.55"))
PRELOAD_MODEL = os.getenv("ASR_PRELOAD_MODEL", "1").strip().lower() not in {"0", "false", "no", "off"}
MODEL_IDLE_SECONDS = max(0, int(os.getenv("ASR_MODEL_IDLE_SECONDS", "900")))
MAX_AUDIO_MB = int(os.getenv("ASR_MAX_AUDIO_MB", "100"))
INITIAL_PROMPT = os.getenv(
    "ASR_INITIAL_PROMPT",
    (
        "Suomenkielistä puhetta. Kirjoita vain se mitä kuulet. "
        "Älä täydennä epäselvää puhetta arvauksilla. "
        "Säilytä murre, puhekieli ja meänkieli sellaisenaan."
    ),
)

_model: Any = None
_model_lock = Lock()
_active_transcriptions = 0
_model_last_used_at = time.monotonic()
app = FastAPI(title=SERVICE_NAME)


def elapsed_ms(started_at: float) -> int:
    return int(round((time.perf_counter() - started_at) * 1000))


def compact_error(error: BaseException) -> str:
    return f"{type(error).__name__}: {error}"


def acquire_model() -> Any:
    global _active_transcriptions, _model, _model_last_used_at
    with _model_lock:
        if _model is not None:
            _active_transcriptions += 1
            return _model

        from faster_whisper import WhisperModel

        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        _active_transcriptions += 1
        _model_last_used_at = time.monotonic()
        return _model


def release_model() -> None:
    global _active_transcriptions, _model_last_used_at
    with _model_lock:
        _active_transcriptions = max(0, _active_transcriptions - 1)
        _model_last_used_at = time.monotonic()


def unload_idle_model_loop() -> None:
    global _model
    while True:
        time.sleep(30)
        if not MODEL_IDLE_SECONDS:
            continue

        released = False
        with _model_lock:
            if (
                _model is not None
                and _active_transcriptions == 0
                and time.monotonic() - _model_last_used_at >= MODEL_IDLE_SECONDS
            ):
                _model = None
                released = True

        if released:
            gc.collect()
            print(f"ASR model released after {MODEL_IDLE_SECONDS}s idle time.", flush=True)


def parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() not in {"0", "false", "no", "off"}


def normalize_segment(segment: Any) -> dict[str, Any]:
    return {
        "start": round(float(getattr(segment, "start", 0.0) or 0.0), 2),
        "end": round(float(getattr(segment, "end", 0.0) or 0.0), 2),
        "text": str(getattr(segment, "text", "") or "").strip(),
        "avgLogProb": round(float(getattr(segment, "avg_logprob", 0.0) or 0.0), 3),
        "noSpeechProbability": round(float(getattr(segment, "no_speech_prob", 0.0) or 0.0), 3),
        "compressionRatio": round(float(getattr(segment, "compression_ratio", 0.0) or 0.0), 3),
    }


def summarize_segments(segments: list[dict[str, Any]]) -> dict[str, Any]:
    """Return comparable, non-audio quality signals for one decode attempt."""
    text = re.sub(r"\s+", " ", " ".join(segment["text"] for segment in segments if segment["text"])).strip()
    if not segments:
        return {"text": text, "avgLogProb": None, "maxNoSpeechProbability": None, "score": -100.0}

    average_logprob = sum(float(segment["avgLogProb"]) for segment in segments) / len(segments)
    max_no_speech = max(float(segment["noSpeechProbability"]) for segment in segments)
    # Prefer likely text, but penalise results the model itself regards as silence.
    score = average_logprob - (max_no_speech * 0.35)
    return {
        "text": text,
        "avgLogProb": round(average_logprob, 3),
        "maxNoSpeechProbability": round(max_no_speech, 3),
        "score": round(score, 3),
    }


def should_retry_decode(summary: dict[str, Any]) -> bool:
    return (
        not summary["text"]
        or summary["avgLogProb"] is None
        or summary["avgLogProb"] <= RETRY_LOW_AVG_LOGPROB
        or summary["maxNoSpeechProbability"] >= RETRY_HIGH_NO_SPEECH_PROBABILITY
    )


def transcribe_bytes(
    audio_bytes: bytes,
    *,
    file_suffix: str = ".webm",
    language: str = LANGUAGE,
    task: str = TASK,
    beam_size: int = BEAM_SIZE,
    vad_filter: bool = VAD_FILTER,
    initial_prompt: str = INITIAL_PROMPT,
) -> dict[str, Any]:
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio is empty.")

    max_bytes = MAX_AUDIO_MB * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Audio exceeds {MAX_AUDIO_MB} MB.")

    started_at = time.perf_counter()
    model = acquire_model()
    suffix = file_suffix if file_suffix.startswith(".") else f".{file_suffix}"
    suffix = suffix[:16] if suffix else ".webm"

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()
            segments_iter, info = model.transcribe(
                tmp.name,
                language=language or LANGUAGE,
                task=task or TASK,
                beam_size=beam_size,
                best_of=BEST_OF,
                vad_filter=vad_filter,
                word_timestamps=WORD_TIMESTAMPS,
                condition_on_previous_text=False,
                initial_prompt=initial_prompt or None,
            )
            segments = [normalize_segment(segment) for segment in segments_iter]
            primary_summary = summarize_segments(segments)
            attempts = [{
                "name": "primary",
                "beamSize": beam_size,
                "vadFilter": vad_filter,
                **primary_summary,
                "selected": True,
            }]

            # The browser already sends a speech-sized chunk. On weak or noisy
            # speech, compare it once with Silero VAD and a wider beam search.
            # Both decodes use the same in-memory file; no audio is persisted.
            if RETRY_ENABLED and should_retry_decode(primary_summary):
                retry_iter, retry_info = model.transcribe(
                    tmp.name,
                    language=language or LANGUAGE,
                    task=task or TASK,
                    beam_size=RETRY_BEAM_SIZE,
                    best_of=BEST_OF,
                    vad_filter=RETRY_VAD_FILTER,
                    word_timestamps=WORD_TIMESTAMPS,
                    condition_on_previous_text=False,
                    initial_prompt=initial_prompt or None,
                )
                retry_segments = [normalize_segment(segment) for segment in retry_iter]
                retry_summary = summarize_segments(retry_segments)
                retry_selected = retry_summary["score"] > primary_summary["score"]
                attempts[0]["selected"] = not retry_selected
                attempts.append({
                    "name": "noise_resilient_retry",
                    "beamSize": RETRY_BEAM_SIZE,
                    "vadFilter": RETRY_VAD_FILTER,
                    **retry_summary,
                    "selected": retry_selected,
                })
                if retry_selected:
                    segments = retry_segments
                    info = retry_info
    finally:
        release_model()

    text = re.sub(r"\s+", " ", " ".join(segment["text"] for segment in segments if segment["text"])).strip()
    language_probability = getattr(info, "language_probability", None)
    duration = getattr(info, "duration", None)

    return {
        "ok": True,
        "service": SERVICE_NAME,
        "text": text,
        "transcript": text,
        "rawTranscript": text,
        "provider": "mutinat_tulkki_faster_whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "computeType": COMPUTE_TYPE,
        "language": getattr(info, "language", language or LANGUAGE),
        "languageProbability": round(float(language_probability), 3) if language_probability is not None else None,
        "durationSeconds": round(float(duration), 2) if duration is not None else None,
        "segments": segments,
        "attempts": attempts,
        "timingMs": elapsed_ms(started_at),
        "settings": {
            "task": task or TASK,
            "beamSize": beam_size,
            "bestOf": BEST_OF,
            "vadFilter": vad_filter,
            "wordTimestamps": WORD_TIMESTAMPS,
            "retryEnabled": RETRY_ENABLED,
        },
    }


@app.on_event("startup")
def startup() -> None:
    if PRELOAD_MODEL:
        acquire_model()
        release_model()
    Thread(target=unload_idle_model_loop, daemon=True, name="asr-idle-unloader").start()


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readyz() -> dict[str, Any]:
    return {
        "status": "ready",
        "service": SERVICE_NAME,
        "modelLoaded": _model is not None,
        "model": MODEL_NAME,
        "device": DEVICE,
        "computeType": COMPUTE_TYPE,
        "language": LANGUAGE,
        "task": TASK,
    }


@app.post("/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile | None = File(default=None),
    audio: UploadFile | None = File(default=None),
    language: str = Form(default=LANGUAGE),
    task: str = Form(default=TASK),
    beam_size: int = Form(default=BEAM_SIZE),
    vad_filter: str = Form(default="1"),
    initial_prompt: str = Form(default=INITIAL_PROMPT),
) -> JSONResponse:
    try:
        content_type = request.headers.get("content-type", "")

        if content_type.startswith("application/json"):
            body = await request.json()
            audio_obj = body.get("audio") if isinstance(body, dict) else {}
            if not isinstance(audio_obj, dict):
                raise HTTPException(status_code=400, detail="JSON body must contain audio object.")
            audio_base64 = str(audio_obj.get("base64") or "")
            audio_bytes = base64.b64decode(audio_base64, validate=True)
            file_name = str(audio_obj.get("fileName") or "audio.webm")
            result = transcribe_bytes(
                audio_bytes,
                file_suffix=Path(file_name).suffix or ".webm",
                language=str(body.get("language") or LANGUAGE),
                task=str(body.get("task") or TASK),
                beam_size=int(body.get("beam_size") or body.get("beamSize") or BEAM_SIZE),
                vad_filter=parse_bool(body.get("vad_filter") or body.get("vadFilter"), VAD_FILTER),
                initial_prompt=str(body.get("initial_prompt") or body.get("initialPrompt") or INITIAL_PROMPT),
            )
            return JSONResponse(result)

        upload = file or audio
        if upload is None:
            raise HTTPException(status_code=400, detail="Multipart request must include file or audio field.")

        audio_bytes = await upload.read()
        result = transcribe_bytes(
            audio_bytes,
            file_suffix=Path(upload.filename or "audio.webm").suffix or ".webm",
            language=language,
            task=task,
            beam_size=beam_size,
            vad_filter=parse_bool(vad_filter, VAD_FILTER),
            initial_prompt=initial_prompt,
        )
        return JSONResponse(result)
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        return JSONResponse(
            {
                "ok": False,
                "service": SERVICE_NAME,
                "error": compact_error(error),
                "text": "",
                "transcript": "",
                "rawTranscript": "",
            },
            status_code=500,
        )
