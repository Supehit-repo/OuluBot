from __future__ import annotations

import os
import re
import io
import threading
import time
import wave
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from piper import PiperVoice
from pydantic import BaseModel, Field


SERVICE_NAME = "HH-TTSservice"
MODELS_DIR = Path(os.getenv("PIPER_MODELS_DIR", "/models/piper"))
DEFAULT_VOICE = os.getenv("PIPER_DEFAULT_VOICE", "fi_FI-harri-medium").strip()
MAX_CHARS = int(os.getenv("TTS_MAX_CHARS", "5000"))
TIMEOUT_SECONDS = int(os.getenv("TTS_TIMEOUT_SECONDS", "90"))
VOICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
voice_cache: dict[str, PiperVoice] = {}
voice_lock = threading.Lock()


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str | None = None


app = FastAPI(title=SERVICE_NAME)


def parse_cors_origins() -> list[str]:
    raw = os.getenv(
        "TTS_CORS_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500",
    )
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:5500", "http://127.0.0.1:5500"]


cors_origins = parse_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in cors_origins else cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def elapsed_ms(started_at: float) -> int:
    return int(round((time.perf_counter() - started_at) * 1000))


def compact_error(error: BaseException) -> str:
    return f"{type(error).__name__}: {error}"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def resolve_voice_id(voice: str | None) -> str:
    voice_id = (voice or DEFAULT_VOICE).strip()

    if not voice_id:
        voice_id = DEFAULT_VOICE

    if not VOICE_ID_PATTERN.fullmatch(voice_id):
        raise HTTPException(status_code=400, detail="Voice id contains unsupported characters.")

    return voice_id


def find_model_path(voice_id: str) -> Path:
    candidates = [
        MODELS_DIR / f"{voice_id}.onnx",
        MODELS_DIR / voice_id / f"{voice_id}.onnx",
    ]

    nested_dir = MODELS_DIR / voice_id
    if nested_dir.is_dir():
        candidates.extend(sorted(nested_dir.glob("*.onnx")))

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    raise HTTPException(
        status_code=404,
        detail=f"Piper voice model not found for '{voice_id}' under {MODELS_DIR}.",
    )


def find_config_path(model_path: Path) -> Path | None:
    candidates = [
        Path(f"{model_path}.json"),
        model_path.with_suffix(".json"),
    ]

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    return None


def list_available_voices() -> list[dict[str, Any]]:
    if not MODELS_DIR.is_dir():
        return []

    voices: list[dict[str, Any]] = []
    seen: set[str] = set()

    for model_path in sorted(MODELS_DIR.rglob("*.onnx")):
        voice_id = model_path.stem
        if voice_id in seen:
            continue
        seen.add(voice_id)
        voices.append(
            {
                "voice": voice_id,
                "model": str(model_path),
                "hasConfig": find_config_path(model_path) is not None,
            }
        )

    return voices


def load_voice(voice_id: str) -> PiperVoice:
    """Load a voice once per service process and retain its ONNX session."""
    model_path = find_model_path(voice_id)
    config_path = find_config_path(model_path)
    cache_key = str(model_path)
    voice = voice_cache.get(cache_key)
    if voice is None:
        voice = PiperVoice.load(str(model_path), config_path=str(config_path) if config_path else None)
        voice_cache[cache_key] = voice
    return voice


def synthesize_wav(text: str, voice_id: str) -> tuple[bytes, dict[str, Any]]:
    clean_text = normalize_text(text)
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is empty.")
    if len(clean_text) > MAX_CHARS:
        raise HTTPException(status_code=413, detail=f"Text exceeds {MAX_CHARS} characters.")

    model_path = find_model_path(voice_id)
    config_path = find_config_path(model_path)
    started_at = time.perf_counter()

    # Piper/ONNX sessions are reusable but not documented as thread-safe.
    # The lock prevents overlapping synthesis while also protecting the cache.
    with voice_lock:
        try:
            voice = load_voice(voice_id)
            output = io.BytesIO()
            with wave.open(output, "wb") as wav_file:
                voice.synthesize_wav(clean_text, wav_file)
            wav_bytes = output.getvalue()
        except Exception as error:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Piper synthesis failed: {compact_error(error)}") from error

    if not wav_bytes:
        raise HTTPException(status_code=500, detail="Piper did not create WAV output.")

    metadata = {
        "voice": voice_id,
        "model": str(model_path),
        "hasConfig": config_path is not None,
        "bytes": len(wav_bytes),
        "timingMs": elapsed_ms(started_at),
    }
    return wav_bytes, metadata


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": SERVICE_NAME,
    }


@app.get("/readyz")
def readyz() -> JSONResponse:
    errors: list[str] = []

    try:
        model_path = find_model_path(resolve_voice_id(DEFAULT_VOICE))
    except HTTPException as error:
        model_path = None
        errors.append(str(error.detail))

    status_code = 200 if not errors else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if not errors else "not_ready",
            "service": SERVICE_NAME,
            "piper": "python-api",
            "modelsDir": str(MODELS_DIR),
            "defaultVoice": DEFAULT_VOICE,
            "defaultModel": str(model_path) if model_path else None,
            "voices": list_available_voices(),
            "errors": errors,
        },
    )


@app.get("/voices")
def voices() -> dict[str, Any]:
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "modelsDir": str(MODELS_DIR),
        "defaultVoice": DEFAULT_VOICE,
        "voices": list_available_voices(),
    }


@app.post("/speak")
def speak(payload: SpeakRequest) -> Response:
    try:
        voice_id = resolve_voice_id(payload.voice)
        wav_bytes, metadata = synthesize_wav(payload.text, voice_id)
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store, max-age=0",
                "Pragma": "no-cache",
                "X-TTS-Service": SERVICE_NAME,
                "X-TTS-Voice": metadata["voice"],
                "X-TTS-Time-Ms": str(metadata["timingMs"]),
            },
        )
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "service": SERVICE_NAME,
                "error": compact_error(error),
            },
        )
