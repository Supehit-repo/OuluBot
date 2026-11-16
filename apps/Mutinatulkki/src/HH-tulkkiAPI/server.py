from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
import json
import os
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def env_bool(value: str) -> bool:
    return value.strip().lower() not in {"0", "false", "no", "off"}


SERVICE_NAME = "HH-tulkkiAPI"
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "5600"))
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(30 * 1024 * 1024)))
MAX_AUDIO_FILE_SIZE_MB = int(os.getenv("MAX_AUDIO_FILE_SIZE_MB", "100"))

STT_ENDPOINT = os.getenv("HH_STT_ENDPOINT", "").strip()
STT_TIMEOUT_SECONDS = int(os.getenv("HH_STT_TIMEOUT_SECONDS", "180"))
STT_PROVIDER = os.getenv("HH_STT_PROVIDER", "auto").strip().lower() or "auto"
STT_HTTP_FORMAT = os.getenv("HH_STT_HTTP_FORMAT", "multipart").strip().lower() or "multipart"
MOCK_TRANSCRIPT_TEXT = os.getenv("HH_MOCK_TRANSCRIPT_TEXT", "").strip()
STT_USE_DRAFT_FAST_PATH = env_bool(os.getenv("HH_STT_USE_DRAFT_FAST_PATH", "0"))
STT_ALLOW_DRAFT_FALLBACK = env_bool(os.getenv("HH_STT_ALLOW_DRAFT_FALLBACK", "0"))
STT_DRAFT_MIN_CHARS = int(os.getenv("HH_STT_DRAFT_MIN_CHARS", "8"))
STT_DRAFT_MIN_CHARS_PER_SECOND = float(os.getenv("HH_STT_DRAFT_MIN_CHARS_PER_SECOND", "6.0"))
STT_DRAFT_DENSITY_MIN_DURATION_SECONDS = float(os.getenv("HH_STT_DRAFT_DENSITY_MIN_DURATION_SECONDS", "4.0"))
STT_QUALITY_GATE_ENABLED = env_bool(os.getenv("HH_STT_QUALITY_GATE_ENABLED", "1"))
STT_UNCLEAR_TEXT = os.getenv(
    "HH_STT_UNCLEAR_TEXT",
    "en valitettavasti saanut selvää äskeisestä, kysy uudestaan.",
).strip()
STT_QUALITY_LOW_LANGUAGE_PROBABILITY = float(os.getenv("HH_STT_QUALITY_LOW_LANGUAGE_PROBABILITY", "0.45"))
STT_QUALITY_LOW_AVG_LOGPROB = float(os.getenv("HH_STT_QUALITY_LOW_AVG_LOGPROB", "-1.25"))
STT_QUALITY_HIGH_NO_SPEECH_PROB = float(os.getenv("HH_STT_QUALITY_HIGH_NO_SPEECH_PROB", "0.72"))
STT_QUALITY_HIGH_COMPRESSION_RATIO = float(os.getenv("HH_STT_QUALITY_HIGH_COMPRESSION_RATIO", "2.8"))
STT_QUALITY_MAX_CHARS_PER_SECOND = float(os.getenv("HH_STT_QUALITY_MAX_CHARS_PER_SECOND", "24.0"))
STT_QUALITY_MIN_DURATION_FOR_DENSITY_SECONDS = float(os.getenv("HH_STT_QUALITY_MIN_DURATION_FOR_DENSITY_SECONDS", "1.2"))

LOCAL_STT_MODEL_PATH = os.getenv("HH_STT_MODEL_PATH", "").strip()
LOCAL_STT_MODEL = os.getenv(
    "HH_STT_MODEL",
    os.getenv("HH_LOCAL_STT_MODEL", "Finnish-NLP/whisper-large-finnish-v3-ct2"),
).strip()
LOCAL_STT_LANGUAGE = os.getenv("HH_STT_LANGUAGE", "fi").strip() or "fi"
LOCAL_STT_TASK = os.getenv("HH_STT_TASK", "transcribe").strip() or "transcribe"
LOCAL_STT_DEVICE = os.getenv("HH_STT_DEVICE", "auto").strip() or "auto"
LOCAL_STT_COMPUTE_TYPE = os.getenv("HH_STT_COMPUTE_TYPE", "auto").strip() or "auto"
LOCAL_STT_BEAM_SIZE = int(os.getenv("HH_STT_BEAM_SIZE", "1"))
LOCAL_STT_BEST_OF = int(os.getenv("HH_STT_BEST_OF", "1"))
LOCAL_STT_VAD_FILTER = os.getenv("HH_STT_VAD_FILTER", "1").strip().lower() not in {"0", "false", "no", "off"}
LOCAL_STT_WORD_TIMESTAMPS = env_bool(os.getenv("HH_STT_WORD_TIMESTAMPS", "0"))
LOCAL_STT_REJECT_SHORT_SEGMENT_MAX_SECONDS = float(os.getenv("HH_STT_REJECT_SHORT_SEGMENT_MAX_SECONDS", "0.75"))
LOCAL_STT_REJECT_SHORT_SEGMENT_MIN_CHARS = int(os.getenv("HH_STT_REJECT_SHORT_SEGMENT_MIN_CHARS", "28"))
LOCAL_STT_REJECT_MAX_CHARS_PER_SECOND = float(os.getenv("HH_STT_REJECT_MAX_CHARS_PER_SECOND", "42.0"))
LOCAL_STT_REJECT_HIGH_NO_SPEECH_PROB = float(os.getenv("HH_STT_REJECT_HIGH_NO_SPEECH_PROB", "0.65"))
LOCAL_STT_REJECT_LOW_AVG_LOGPROB = float(os.getenv("HH_STT_REJECT_LOW_AVG_LOGPROB", "-1.2"))
LOCAL_STT_INITIAL_PROMPT = os.getenv(
    "HH_STT_INITIAL_PROMPT",
    (
        "Suomenkielistä puhetta. Kirjoita vain se mitä kuulet. "
        "Älä täydennä epäselvää puhetta arvauksilla. "
        "Säilytä murre, puhekieli ja meänkieli sellaisenaan."
    ),
).strip()

INTERPRET_DROP_FILLERS = env_bool(os.getenv("HH_INTERPRET_DROP_FILLERS", "0"))
NORMALIZE_DIALECT_TO_STANDARD = env_bool(os.getenv("HH_NORMALIZE_DIALECT_TO_STANDARD", "1"))
DIALECT_DETECTION_MIN_SCORE = float(os.getenv("HH_DIALECT_DETECTION_MIN_SCORE", "2.0"))
DIALECT_LEXICON_PATH = Path(
    os.getenv(
        "HH_DIALECT_LEXICON_PATH",
        str(Path(__file__).with_name("dialects") / "fi_dialects.json"),
    )
).expanduser()

_LOCAL_STT_MODEL_INSTANCE: Any = None
_LOCAL_STT_MODEL_LOCK = threading.Lock()
_DIALECT_LEXICON_CACHE: dict[str, Any] | None = None

DEFAULT_CONFIG_ID = "cfg_default_mutinatulkki"
CONFIGS: dict[str, dict[str, Any]] = {
    DEFAULT_CONFIG_ID: {
        "configId": DEFAULT_CONFIG_ID,
        "version": 1,
        "status": "active",
        "tenantId": "local-mutinatulkki",
        "config": {
            "sourceLanguage": "fi",
            "targetLanguages": ["fi"],
            "processing": {
                "mode": "transcribe",
                "dialectProfile": {
                    "enabled": True,
                    "language": "fit",
                    "name": "meankieli",
                    "useLocalDialectDatabase": True,
                },
                "voiceIdentity": {
                    "enabled": False,
                },
            },
        },
    }
}


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def parse_json_bytes(body: bytes) -> dict[str, Any]:
    if not body:
        return {}
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("JSON-rungon pitää olla objekti.")
    return value


def first_text(value: Any, keys: list[str]) -> str:
    if not isinstance(value, dict):
        return ""
    for key in keys:
        text = value.get(key)
        if isinstance(text, str) and text.strip():
            return text.strip()
    return ""


def elapsed_ms(started_at: float) -> int:
    return int(round((time.perf_counter() - started_at) * 1000))


def compact_error(error: BaseException) -> str:
    return f"{type(error).__name__}: {error}"


def get_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    metadata = payload.get("metadata")
    return metadata if isinstance(metadata, dict) else payload


def get_nested(value: Any, path: list[str]) -> Any:
    current = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def get_chunk_index(payload: dict[str, Any]) -> str:
    metadata = get_metadata(payload)
    chunk_index = get_nested(metadata, ["recording", "chunk", "index"])
    return str(chunk_index) if chunk_index is not None else "?"


def get_audio_duration_seconds(payload: dict[str, Any]) -> float | None:
    metadata = get_metadata(payload)
    duration_ms = (
        get_nested(metadata, ["recording", "chunk", "durationMs"])
        or get_nested(metadata, ["recording", "durationMs"])
    )
    try:
        duration = float(duration_ms)
    except (TypeError, ValueError):
        return None

    return duration / 1000 if duration > 0 else None


def get_request_text_draft(payload: dict[str, Any]) -> dict[str, Any]:
    metadata = get_metadata(payload)
    recognition_draft = metadata.get("recognitionDraft") if isinstance(metadata, dict) else {}
    recognition_source = ""
    if isinstance(recognition_draft, dict):
        recognition_source = str(recognition_draft.get("source") or "")

    text = first_text(
        metadata,
        ["server_transcript_raw", "browser_raw_text", "transcript", "text"],
    )
    provider = recognition_source if recognition_source and recognition_source != "none" else "request"

    if not text and isinstance(recognition_draft, dict):
        text = first_text(recognition_draft, ["finalText", "interimText"])
        provider = recognition_source or "recognition_draft"

    return {
        "text": text,
        "provider": provider,
        "source": recognition_source or provider,
        "available": bool(text),
        "recognitionDraft": {
            "enabled": bool(recognition_draft.get("enabled")) if isinstance(recognition_draft, dict) else False,
            "source": recognition_source or "none",
            "finalChars": len(str(recognition_draft.get("finalText") or "")) if isinstance(recognition_draft, dict) else 0,
            "interimChars": len(str(recognition_draft.get("interimText") or "")) if isinstance(recognition_draft, dict) else 0,
            "errors": recognition_draft.get("errors", []) if isinstance(recognition_draft, dict) else [],
        },
    }


def normalize_stt_provider(value: str) -> str:
    normalized = (value or "auto").strip().lower()
    aliases = {
        "faster-whisper": "local",
        "faster_whisper": "local",
        "whisper": "local",
        "endpoint": "http",
        "remote": "http",
    }
    return aliases.get(normalized, normalized)


def local_stt_module_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def resolve_local_stt_model_ref() -> dict[str, Any]:
    if LOCAL_STT_MODEL_PATH:
        path = Path(LOCAL_STT_MODEL_PATH).expanduser()
        return {
            "ref": str(path),
            "source": "HH_STT_MODEL_PATH",
            "isLocalPath": True,
            "exists": path.exists(),
        }

    if LOCAL_STT_MODEL:
        candidate = Path(LOCAL_STT_MODEL).expanduser()
        looks_like_path = (
            bool(re.match(r"^[A-Za-z]:[\\/]", LOCAL_STT_MODEL))
            or "\\" in LOCAL_STT_MODEL
            or LOCAL_STT_MODEL.startswith((".", "~", "/"))
        )
        return {
            "ref": str(candidate) if looks_like_path else LOCAL_STT_MODEL,
            "source": "HH_STT_MODEL",
            "isLocalPath": looks_like_path,
            "exists": candidate.exists() if looks_like_path else None,
        }

    return {
        "ref": "",
        "source": "none",
        "isLocalPath": False,
        "exists": None,
    }


def stt_setup_hints() -> list[str]:
    hints: list[str] = []
    provider = normalize_stt_provider(STT_PROVIDER)
    local_model = resolve_local_stt_model_ref()

    if provider in {"auto", "local"}:
        if not local_stt_module_available():
            hints.append("Python-paketti faster-whisper puuttuu tästä HH-tulkkiAPI-ajoympäristöstä.")
        if local_model["isLocalPath"] and not local_model["exists"]:
            hints.append(f"HH_STT_MODEL_PATH ei löydy levyltä: {local_model['ref']}")
        if not local_model["ref"]:
            hints.append("HH_STT_MODEL tai HH_STT_MODEL_PATH puuttuu.")

    if not STT_ENDPOINT and provider in {"auto", "http"}:
        if provider == "auto" and hints:
            hints.insert(0, "Serveri-STT puuttuu: aseta HH_STT_ENDPOINT tai ota paikallinen faster-whisper käyttöön.")
        else:
            hints.append("HH_STT_ENDPOINT ei ole asetettu, joten HTTP-STT:tä ei yritetä.")

    if not hints:
        hints.append("STT näyttää konfiguroidulta. Jos teksti jää tyhjäksi, tarkista mallin lataus, äänen laatu ja segmentit.")

    return hints


def stt_readiness() -> dict[str, Any]:
    provider = normalize_stt_provider(STT_PROVIDER)
    local_model = resolve_local_stt_model_ref()
    local_available = local_stt_module_available()
    http_configured = bool(STT_ENDPOINT)
    local_configured = provider in {"auto", "local"} and local_available and bool(local_model["ref"])
    configured = bool(MOCK_TRANSCRIPT_TEXT) or http_configured or local_configured

    return {
        "state": "configured" if configured else "not_configured",
        "provider": provider,
        "mockConfigured": bool(MOCK_TRANSCRIPT_TEXT),
        "http": {
            "configured": http_configured,
            "endpoint": STT_ENDPOINT or None,
            "timeoutSeconds": STT_TIMEOUT_SECONDS,
            "format": STT_HTTP_FORMAT,
        },
        "local": {
            "configured": local_configured,
            "module": "faster-whisper",
            "moduleAvailable": local_available,
            "model": local_model,
            "language": LOCAL_STT_LANGUAGE,
            "task": LOCAL_STT_TASK,
            "device": LOCAL_STT_DEVICE,
            "computeType": LOCAL_STT_COMPUTE_TYPE,
            "beamSize": LOCAL_STT_BEAM_SIZE,
            "bestOf": LOCAL_STT_BEST_OF,
            "vadFilter": LOCAL_STT_VAD_FILTER,
            "wordTimestamps": LOCAL_STT_WORD_TIMESTAMPS,
            "segmentReject": {
                "shortSegmentMaxSeconds": LOCAL_STT_REJECT_SHORT_SEGMENT_MAX_SECONDS,
                "shortSegmentMinChars": LOCAL_STT_REJECT_SHORT_SEGMENT_MIN_CHARS,
                "maxCharsPerSecond": LOCAL_STT_REJECT_MAX_CHARS_PER_SECOND,
                "highNoSpeechProbability": LOCAL_STT_REJECT_HIGH_NO_SPEECH_PROB,
                "lowAvgLogProb": LOCAL_STT_REJECT_LOW_AVG_LOGPROB,
            },
        },
        "draftFastPath": {
            "enabled": STT_USE_DRAFT_FAST_PATH,
            "minChars": STT_DRAFT_MIN_CHARS,
            "minCharsPerSecond": STT_DRAFT_MIN_CHARS_PER_SECOND,
            "densityMinDurationSeconds": STT_DRAFT_DENSITY_MIN_DURATION_SECONDS,
        },
        "qualityGate": {
            "enabled": STT_QUALITY_GATE_ENABLED,
            "unclearText": STT_UNCLEAR_TEXT,
            "lowLanguageProbability": STT_QUALITY_LOW_LANGUAGE_PROBABILITY,
            "lowAvgLogProb": STT_QUALITY_LOW_AVG_LOGPROB,
            "highNoSpeechProbability": STT_QUALITY_HIGH_NO_SPEECH_PROB,
            "highCompressionRatio": STT_QUALITY_HIGH_COMPRESSION_RATIO,
            "maxCharsPerSecond": STT_QUALITY_MAX_CHARS_PER_SECOND,
            "minDurationForDensitySeconds": STT_QUALITY_MIN_DURATION_FOR_DENSITY_SECONDS,
        },
        "requestDraftFallback": "enabled" if STT_ALLOW_DRAFT_FALLBACK else "disabled",
        "setupHints": stt_setup_hints(),
    }


def load_dialect_lexicon() -> dict[str, Any]:
    global _DIALECT_LEXICON_CACHE
    if _DIALECT_LEXICON_CACHE is not None:
        return _DIALECT_LEXICON_CACHE

    try:
        with DIALECT_LEXICON_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        _DIALECT_LEXICON_CACHE = data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError) as error:
        _DIALECT_LEXICON_CACHE = {
            "version": 0,
            "profiles": {},
            "common": {},
            "error": compact_error(error),
        }

    return _DIALECT_LEXICON_CACHE


def normalization_readiness() -> dict[str, Any]:
    lexicon = load_dialect_lexicon()
    profiles = lexicon.get("profiles") if isinstance(lexicon.get("profiles"), dict) else {}
    return {
        "enabled": NORMALIZE_DIALECT_TO_STANDARD,
        "mode": "dialect_to_standard_fi" if NORMALIZE_DIALECT_TO_STANDARD else "raw",
        "lexiconPath": str(DIALECT_LEXICON_PATH),
        "lexiconLoaded": bool(profiles),
        "lexiconVersion": lexicon.get("version"),
        "profileCount": len(profiles),
        "profiles": sorted(profiles.keys()),
        "detectionMinScore": DIALECT_DETECTION_MIN_SCORE,
        "error": lexicon.get("error"),
    }


def text_words(value: str) -> list[str]:
    return re.findall(r"[^\W\d_]+", str(value or "").casefold(), flags=re.UNICODE)


def has_text_marker(text: str, marker: str, words: set[str]) -> bool:
    normalized_marker = str(marker or "").casefold().strip()
    if not normalized_marker:
        return False

    if " " not in normalized_marker:
        return normalized_marker in words

    pattern = rf"(?<!\w){re.escape(normalized_marker)}(?!\w)"
    return bool(re.search(pattern, text.casefold(), flags=re.IGNORECASE))


def detect_dialect_profile(text: str) -> dict[str, Any]:
    lexicon = load_dialect_lexicon()
    profiles = lexicon.get("profiles") if isinstance(lexicon.get("profiles"), dict) else {}
    words = set(text_words(text))
    best_profile_id = "standard_fi"
    best_label = "Kirjakieli / yleispuhekieli"
    best_score = 0.0
    best_markers: list[str] = []

    for profile_id, profile in profiles.items():
        if not isinstance(profile, dict):
            continue

        score = 0.0
        markers: list[str] = []
        profile_markers = profile.get("markers") if isinstance(profile.get("markers"), dict) else {}
        for marker, weight in profile_markers.items():
            if has_text_marker(text, marker, words):
                try:
                    marker_weight = float(weight)
                except (TypeError, ValueError):
                    marker_weight = 1.0
                score += marker_weight
                markers.append(str(marker))

        if score > best_score:
            best_profile_id = str(profile_id)
            best_label = str(profile.get("label") or profile_id)
            best_score = score
            best_markers = markers

    if best_score < DIALECT_DETECTION_MIN_SCORE:
        return {
            "profile": "standard_fi",
            "label": "Kirjakieli / yleispuhekieli",
            "score": best_score,
            "confidence": "low",
            "markers": best_markers[:8],
        }

    confidence = "high" if best_score >= 6 else "medium"
    return {
        "profile": best_profile_id,
        "label": best_label,
        "score": best_score,
        "confidence": confidence,
        "markers": best_markers[:8],
    }


def get_dialect_profile(profile_id: str) -> dict[str, Any]:
    lexicon = load_dialect_lexicon()
    profiles = lexicon.get("profiles") if isinstance(lexicon.get("profiles"), dict) else {}
    profile = profiles.get(profile_id)
    return profile if isinstance(profile, dict) else {}


def record_normalization_change(
    changes: list[dict[str, Any]] | None,
    source: str,
    before: str,
    after: str,
) -> None:
    if changes is None or before == after:
        return

    changes.append(
        {
            "source": source,
            "from": before,
            "to": after,
        }
    )


def apply_replacement_case(replacement: str, original: str) -> str:
    if original.isupper():
        return replacement.upper()
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def apply_regex_replacements(
    value: str,
    replacements: list[Any],
    changes: list[dict[str, Any]] | None,
    source: str,
) -> str:
    text = str(value or "")
    for item in replacements:
        if not isinstance(item, dict):
            continue

        pattern = str(item.get("pattern") or "")
        replacement = str(item.get("replacement") or "")
        if not pattern:
            continue

        try:
            regex = re.compile(pattern, flags=re.IGNORECASE)
        except re.error:
            continue

        def replace(match: re.Match[str]) -> str:
            before = match.group(0)
            expanded = match.expand(replacement)
            after = apply_replacement_case(expanded, before)
            record_normalization_change(changes, source, before, after)
            return after

        text = regex.sub(replace, text)

    return text


def apply_word_replacements(
    value: str,
    replacements: dict[str, Any],
    changes: list[dict[str, Any]] | None,
    source: str,
) -> str:
    text = str(value or "")
    if not isinstance(replacements, dict):
        return text

    for original, replacement_value in replacements.items():
        replacement = str(replacement_value or "")
        if not original or not replacement:
            continue

        pattern = rf"(?<!\w){re.escape(str(original))}(?!\w)"
        regex = re.compile(pattern, flags=re.IGNORECASE)

        def replace(match: re.Match[str]) -> str:
            before = match.group(0)
            after = apply_replacement_case(replacement, before)
            record_normalization_change(changes, source, before, after)
            return after

        text = regex.sub(replace, text)

    return text


def foreign_term_matches(value: str, term: dict[str, Any]) -> bool:
    """Return true when a configured foreign/proper term occurs as whole words."""
    canonical = str(term.get("canonical") or "").strip()
    aliases = term.get("aliases") if isinstance(term.get("aliases"), list) else []
    variants = [canonical, *[str(alias or "").strip() for alias in aliases]]
    return any(
        variant and re.search(rf"(?<!\w){re.escape(variant)}(?!\w)", value, re.IGNORECASE)
        for variant in variants
    )


def protect_foreign_terms(
    value: str,
    terms: list[Any],
    changes: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    """Canonicalize known English/proper terms before dialect rules can touch them."""
    text = str(value or "")
    recognized: list[dict[str, Any]] = []

    for item in terms:
        if not isinstance(item, dict):
            continue
        canonical = str(item.get("canonical") or "").strip()
        aliases = item.get("aliases") if isinstance(item.get("aliases"), list) else []
        variants = [canonical, *[str(alias or "").strip() for alias in aliases]]
        variants = sorted({variant for variant in variants if variant}, key=len, reverse=True)
        if not canonical or not variants:
            continue

        pattern = rf"(?<!\w)(?:{'|'.join(re.escape(variant) for variant in variants)})(?!\w)"

        def replace(match: re.Match[str]) -> str:
            before = match.group(0)
            after = canonical
            if before != after:
                record_normalization_change(changes, "foreign_term", before, after)
            return after

        before_replace = text
        text = re.sub(pattern, replace, text, flags=re.IGNORECASE)
        if before_replace != text or foreign_term_matches(text, {"canonical": canonical}):
            recognized.append(item)

    return text, recognized


def make_foreign_term_search_variant(value: str, terms: list[dict[str, Any]]) -> str:
    """Offer a Finnish meaning as a retrieval alternative, never as a visible rewrite."""
    text = str(value or "")
    for term in terms:
        canonical = str(term.get("canonical") or "").strip()
        translation = str(term.get("searchTranslation") or "").strip()
        if not canonical or not translation:
            continue
        text = re.sub(
            rf"(?<!\w){re.escape(canonical)}(?!\w)",
            translation,
            text,
            flags=re.IGNORECASE,
        )
    return finalize_standard_fi_text(text)


def remove_artificial_word_hyphens(value: str) -> str:
    """Treat a hyphen between spoken Finnish words as an STT punctuation artifact.

    The recognizer occasionally joins two separately spoken words with a hyphen
    (for example ``tolkula-mallilla``).  The boundary layer must not invent a
    compound word: both the displayed question and the dictionary lookup use
    separate words.  This deliberately leaves number and non-word punctuation
    untouched.
    """
    return re.sub(r"(?<=[A-Za-zÅÄÖåäö])-(?=[A-Za-zÅÄÖåäö])", " ", str(value or ""))


def finalize_standard_fi_text(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([,.;:!?])([^\s])", r"\1 \2", text)
    text = re.sub(r"\s+", " ", text).strip()

    if text and text[-1] not in ".!?":
        if is_question_like(text):
            text = f"{text}?"
        else:
            text = f"{text}."

    return text[:1].upper() + text[1:] if text else ""


def normalize_speech_text(value: str) -> dict[str, Any]:
    raw_text = remove_artificial_word_hyphens(value)
    raw_text = re.sub(r"\s+", " ", raw_text).strip()
    raw_text = raw_text.strip("\"'“”‘’")
    changes: list[dict[str, Any]] = []
    dialect = detect_dialect_profile(raw_text)

    if not raw_text:
        return {
            "enabled": NORMALIZE_DIALECT_TO_STANDARD,
            "mode": "dialect_to_standard_fi" if NORMALIZE_DIALECT_TO_STANDARD else "raw",
            "text": "",
            "sourceText": "",
            "changed": False,
            "dialect": dialect,
            "replacementCount": 0,
            "replacements": [],
        }

    text = apply_common_speech_corrections(raw_text, changes)
    lexicon = load_dialect_lexicon()
    foreign_terms = lexicon.get("foreignTerms") if isinstance(lexicon.get("foreignTerms"), list) else []
    text, recognized_foreign_terms = protect_foreign_terms(text, foreign_terms, changes)

    if NORMALIZE_DIALECT_TO_STANDARD:
        common = lexicon.get("common") if isinstance(lexicon.get("common"), dict) else {}
        profile = get_dialect_profile(str(dialect.get("profile") or ""))

        text = apply_regex_replacements(text, common.get("phraseReplacements", []), changes, "common_phrase")
        text = apply_word_replacements(text, common.get("wordReplacements", {}), changes, "common_word")
        text = apply_regex_replacements(text, profile.get("phraseReplacements", []), changes, "dialect_phrase")
        text = apply_word_replacements(text, profile.get("wordReplacements", {}), changes, "dialect_word")
        text = apply_regex_replacements(text, common.get("postPhraseReplacements", []), changes, "common_post_phrase")

    if INTERPRET_DROP_FILLERS:
        before_filler_cleanup = text
        filler_pattern = re.compile(
            r"^(no niin|no ni|nooh|noh|joo|tuota|tota|öö+|mm+)[,.\s]+",
            re.IGNORECASE,
        )
        previous = None
        while previous != text:
            previous = text
            text = filler_pattern.sub("", text).strip()
        if text != before_filler_cleanup:
            record_normalization_change(changes, "filler_cleanup", before_filler_cleanup, text)

    normalized_text = finalize_standard_fi_text(text)

    return {
        "enabled": NORMALIZE_DIALECT_TO_STANDARD,
        "mode": "dialect_to_standard_fi" if NORMALIZE_DIALECT_TO_STANDARD else "raw",
        "text": normalized_text,
        "sourceText": raw_text,
        "changed": normalized_text != raw_text,
        "dialect": dialect,
        "replacementCount": len(changes),
        "replacements": changes[:30],
        "foreignTerms": recognized_foreign_terms,
    }


def normalize_interpreted_text(value: str) -> str:
    return normalize_speech_text(value).get("text", "")


def build_query_candidates(raw_text: str, normalization: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep Murretulkki's preferred reading, but retain the spoken alternative.

    AgentAPI may use its grounded retrieval score to select the alternative only
    when it clearly matches the source material better. The dialect-normalized
    candidate remains first, so an inconclusive retrieval never erases the
    interpretation work done here.
    """
    candidates: list[dict[str, Any]] = []
    foreign_terms = normalization.get("foreignTerms") if isinstance(normalization.get("foreignTerms"), list) else []
    variants: list[tuple[str, Any]] = [("dialect_normalized", normalization.get("text"))]
    if foreign_terms:
        # Retain the spoken English/proper name for the person, while giving
        # Finnish-only source text an equally grounded search alternative.
        variants.append(("foreign_term_finnish_search", make_foreign_term_search_variant(normalization.get("text", ""), foreign_terms)))
    else:
        variants.append(("spoken_raw", finalize_standard_fi_text(raw_text)))

    for kind, text in variants:
        clean = str(text or "").strip()
        if not clean or any(candidate["text"].casefold() == clean.casefold() for candidate in candidates):
            continue
        candidates.append(
            {
                "text": clean,
                "kind": kind,
                "dialectProfile": normalization.get("dialect", {}).get("profile"),
                "dialectConfidence": normalization.get("dialect", {}).get("confidence"),
                "replacementCount": normalization.get("replacementCount", 0),
            }
        )
    return candidates


def is_question_like(text: str) -> bool:
    question_words = (
        r"(joko|mitä|miksi|miten|missä|milloin|kuka|kenen|voiko|voitko|voisitko|onko|"
        r"oletko|olenko|alatko|alkaako|muistatko|pelkäätkö|pitääkö|pitäisikö|täytyykö|saako|saanko|käykö)"
    )
    if re.match(rf"^{question_words}\b", text, re.IGNORECASE):
        return True

    return bool(
        re.match(r"^(katso|katsoppa|katoppa|tarkista)\b", text, re.IGNORECASE)
        and re.search(rf"\b{question_words}\b", text, re.IGNORECASE)
    )


def apply_common_speech_corrections(value: str, changes: list[dict[str, Any]] | None = None) -> str:
    text = str(value or "")
    replacements = [
        {"pattern": r"\b(katopa|katsopa|katsoppa|katoppa)\b", "replacement": "katso"},
        {"pattern": r"\bkonenterissa\b", "replacement": "kalenterissa"},
        {"pattern": r"\bkalenterista\b", "replacement": "kalenterissa"},
        {"pattern": r"\bvoinko\s+kalenterissa\b", "replacement": "onko kalenterissa"},
        {"pattern": r"\bvoinko\s+kalenterista\b", "replacement": "onko kalenterissa"},
        {"pattern": r"\bkato\s+onko\b", "replacement": "katso onko"},
        {"pattern": r"\btesti\s+pätkä\b", "replacement": "testipätkä"},
        {"pattern": r"\bnaahattelee\b", "replacement": "nauhoittelee"},
        {"pattern": r"\bnaahutusta\b", "replacement": "nauhoitusta"},
    ]
    text = apply_regex_replacements(text, replacements, changes, "speech_correction")

    before = text
    text = re.sub(r"^(katso)\s+(onko)\b", r"\1, \2", text, flags=re.IGNORECASE)
    record_normalization_change(changes, "speech_correction", before, text)
    return re.sub(r"\s+", " ", text).strip()


def http_json_post(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = Request(
        url,
        data=json_bytes(payload),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        response_body = response.read()
    if not response_body:
        return {}
    data = json.loads(response_body.decode("utf-8"))
    return data if isinstance(data, dict) else {}


def http_multipart_audio_post(
    url: str,
    audio_bytes: bytes,
    *,
    file_name: str,
    mime_type: str,
    fields: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    boundary = f"----hh-tulkkiapi-{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    def add_field(name: str, value: Any) -> None:
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")

    for key, value in fields.items():
        if value is not None:
            add_field(key, value)

    safe_file_name = re.sub(r'["\r\n]', "_", file_name or "audio.webm")
    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(
        (
            f'Content-Disposition: form-data; name="file"; filename="{safe_file_name}"\r\n'
            f"Content-Type: {mime_type or 'audio/webm'}\r\n\r\n"
        ).encode("utf-8")
    )
    chunks.append(audio_bytes)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))

    body = b"".join(chunks)
    request = Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    with urlopen(request, timeout=timeout) as response:
        response_body = response.read()
    if not response_body:
        return {}
    data = json.loads(response_body.decode("utf-8"))
    return data if isinstance(data, dict) else {}


def decode_audio(audio: dict[str, Any]) -> tuple[bytes, str]:
    audio_base64 = str(audio.get("base64") or "")
    if not audio_base64:
        raise ValueError("Audio puuttuu tai base64-kenttä on tyhjä.")

    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except Exception as error:  # noqa: BLE001
        raise ValueError("Audio ei ole kelvollista base64-dataa.") from error

    max_bytes = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise ValueError(f"Audio ylittää sallitun koon {MAX_AUDIO_FILE_SIZE_MB} MB.")

    checksum = hashlib.sha256(audio_bytes).hexdigest()
    return audio_bytes, checksum


def summarize_text_draft(draft: dict[str, Any]) -> dict[str, Any]:
    recognition_draft = draft.get("recognitionDraft")
    summary = {
        "available": bool(draft.get("text")),
        "textChars": len(str(draft.get("text") or "")),
        "provider": draft.get("provider"),
        "source": draft.get("source"),
        "recognitionDraft": recognition_draft if isinstance(recognition_draft, dict) else {},
    }
    decision = draft.get("fastPathDecision")
    if isinstance(decision, dict):
        summary["fastPathDecision"] = decision
    return summary


def stt_attempt_summary(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "provider": result.get("provider"),
        "configured": result.get("configured"),
        "textChars": len(str(result.get("text") or "")),
        "model": result.get("model"),
        "endpoint": result.get("endpoint"),
        "requestFormat": result.get("requestFormat"),
        "language": result.get("language"),
        "languageProbability": result.get("languageProbability"),
        "segmentCount": len(result.get("segments") or []),
        "rejectedSegmentCount": len(result.get("rejectedSegments") or []),
        "timingMs": result.get("timingMs"),
        "error": result.get("error"),
        "note": result.get("note"),
    }


def get_draft_fast_path_decision(payload: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    text = str(draft.get("text") or "").strip()
    duration_seconds = get_audio_duration_seconds(payload)
    text_chars = len(text)
    chars_per_second = text_chars / duration_seconds if duration_seconds else None
    reasons: list[str] = []

    if not STT_USE_DRAFT_FAST_PATH:
        reasons.append("draft_fast_path_disabled")

    if text_chars < STT_DRAFT_MIN_CHARS:
        reasons.append("draft_too_short")

    if (
        duration_seconds is not None
        and duration_seconds >= STT_DRAFT_DENSITY_MIN_DURATION_SECONDS
        and chars_per_second is not None
        and chars_per_second < STT_DRAFT_MIN_CHARS_PER_SECOND
    ):
        reasons.append("draft_too_sparse_for_audio_duration")

    return {
        "useFastPath": not reasons,
        "reasons": reasons,
        "textChars": text_chars,
        "durationSeconds": round(duration_seconds, 2) if duration_seconds is not None else None,
        "charsPerSecond": round(chars_per_second, 2) if chars_per_second is not None else None,
        "minChars": STT_DRAFT_MIN_CHARS,
        "minCharsPerSecond": STT_DRAFT_MIN_CHARS_PER_SECOND,
        "densityMinDurationSeconds": STT_DRAFT_DENSITY_MIN_DURATION_SECONDS,
    }


def enrich_transcription_debug(
    result: dict[str, Any],
    attempts: list[dict[str, Any]],
    draft: dict[str, Any],
) -> dict[str, Any]:
    return {
        **result,
        "attempts": attempts,
        "draft": summarize_text_draft(draft),
        "setup": stt_readiness(),
        "setupHints": stt_setup_hints(),
    }


def load_local_stt_model() -> Any:
    global _LOCAL_STT_MODEL_INSTANCE

    if _LOCAL_STT_MODEL_INSTANCE is not None:
        return _LOCAL_STT_MODEL_INSTANCE

    model_ref = resolve_local_stt_model_ref()["ref"]
    if not model_ref:
        raise RuntimeError("HH_STT_MODEL tai HH_STT_MODEL_PATH puuttuu.")

    with _LOCAL_STT_MODEL_LOCK:
        if _LOCAL_STT_MODEL_INSTANCE is not None:
            return _LOCAL_STT_MODEL_INSTANCE

        from faster_whisper import WhisperModel  # type: ignore[import-not-found]

        kwargs: dict[str, Any] = {}
        if LOCAL_STT_DEVICE != "auto":
            kwargs["device"] = LOCAL_STT_DEVICE
        if LOCAL_STT_COMPUTE_TYPE != "auto":
            kwargs["compute_type"] = LOCAL_STT_COMPUTE_TYPE

        _LOCAL_STT_MODEL_INSTANCE = WhisperModel(model_ref, **kwargs)
        return _LOCAL_STT_MODEL_INSTANCE


def transcribe_with_local_faster_whisper(audio_bytes: bytes) -> dict[str, Any]:
    started_at = time.perf_counter()
    model_info = resolve_local_stt_model_ref()

    if not local_stt_module_available():
        return {
            "text": "",
            "provider": "faster_whisper",
            "configured": False,
            "model": model_info["ref"] or None,
            "language": LOCAL_STT_LANGUAGE,
            "timingMs": elapsed_ms(started_at),
            "error": "faster-whisper ei ole asennettu Python-ympäristöön.",
            "note": "Paikallista Whisper-STT:tä ei voitu käynnistää.",
        }

    if model_info["isLocalPath"] and not model_info["exists"]:
        return {
            "text": "",
            "provider": "faster_whisper",
            "configured": False,
            "model": model_info["ref"],
            "language": LOCAL_STT_LANGUAGE,
            "timingMs": elapsed_ms(started_at),
            "error": f"Mallipolkua ei löydy: {model_info['ref']}",
            "note": "Paikallista Whisper-STT:tä ei voitu käynnistää.",
        }

    try:
        model = load_local_stt_model()
        segments_iter, info = model.transcribe(
            io.BytesIO(audio_bytes),
            language=LOCAL_STT_LANGUAGE,
            task=LOCAL_STT_TASK,
            beam_size=LOCAL_STT_BEAM_SIZE,
            best_of=LOCAL_STT_BEST_OF,
            vad_filter=LOCAL_STT_VAD_FILTER,
            initial_prompt=LOCAL_STT_INITIAL_PROMPT or None,
            word_timestamps=LOCAL_STT_WORD_TIMESTAMPS,
            condition_on_previous_text=False,
        )
        raw_segments = []

        for segment in segments_iter:
            segment_text = str(getattr(segment, "text", "") or "").strip()
            raw_segments.append(
                {
                    "start": round(float(getattr(segment, "start", 0.0) or 0.0), 2),
                    "end": round(float(getattr(segment, "end", 0.0) or 0.0), 2),
                    "text": segment_text,
                    "avgLogProb": round(float(getattr(segment, "avg_logprob", 0.0) or 0.0), 3),
                    "noSpeechProbability": round(float(getattr(segment, "no_speech_prob", 0.0) or 0.0), 3),
                    "compressionRatio": round(float(getattr(segment, "compression_ratio", 0.0) or 0.0), 3),
                }
            )

        segments, rejected_segments = filter_stt_segments(raw_segments)
        text_parts = [segment["text"] for segment in segments if segment.get("text")]
        text = re.sub(r"\s+", " ", " ".join(text_parts)).strip()
        language_probability = getattr(info, "language_probability", None)
        duration = getattr(info, "duration", None)
        note = "Ajettiin paikallinen faster-whisper suomen kielen asetuksilla."
        if rejected_segments:
            note += f" Hylättiin {len(rejected_segments)} epäilyttävää jälkisegmenttiä."

        return {
            "text": text,
            "provider": "faster_whisper",
            "configured": True,
            "model": model_info["ref"],
            "language": getattr(info, "language", LOCAL_STT_LANGUAGE),
            "languageProbability": round(float(language_probability), 3) if language_probability is not None else None,
            "durationSeconds": round(float(duration), 2) if duration is not None else None,
            "segments": segments,
            "rejectedSegments": rejected_segments,
            "rawSegmentCount": len(raw_segments),
            "timingMs": elapsed_ms(started_at),
            "note": note,
        }
    except Exception as error:  # noqa: BLE001
        return {
            "text": "",
            "provider": "faster_whisper",
            "configured": True,
            "model": model_info["ref"] or None,
            "language": LOCAL_STT_LANGUAGE,
            "timingMs": elapsed_ms(started_at),
            "error": compact_error(error),
            "note": "Paikallinen Whisper-STT yritettiin ajaa, mutta se epäonnistui.",
        }


def transcribe_with_http_stt(payload: dict[str, Any], audio_bytes: bytes) -> dict[str, Any]:
    started_at = time.perf_counter()
    audio = payload.get("audio") if isinstance(payload.get("audio"), dict) else {}
    language = payload.get("sourceLanguage") or LOCAL_STT_LANGUAGE
    model = payload.get("target", {}).get("model") if isinstance(payload.get("target"), dict) else LOCAL_STT_MODEL
    stt_payload = {
        "audio": {
            "base64": audio.get("base64"),
            "mimeType": audio.get("mimeType") or "audio/webm",
            "fileName": audio.get("fileName"),
            "sizeBytes": len(audio_bytes),
        },
        "language": language,
        "model": model,
        "metadata": get_metadata(payload),
    }

    try:
        if STT_HTTP_FORMAT == "json":
            data = http_json_post(STT_ENDPOINT, stt_payload, STT_TIMEOUT_SECONDS)
            request_format = "json"
        else:
            data = http_multipart_audio_post(
                STT_ENDPOINT,
                audio_bytes,
                file_name=str(audio.get("fileName") or "audio.webm"),
                mime_type=str(audio.get("mimeType") or "audio/webm"),
                fields={
                    "language": language,
                    "task": LOCAL_STT_TASK,
                    "beam_size": LOCAL_STT_BEAM_SIZE,
                    "vad_filter": "1" if LOCAL_STT_VAD_FILTER else "0",
                    "initial_prompt": LOCAL_STT_INITIAL_PROMPT,
                    "metadata": json.dumps(get_metadata(payload), ensure_ascii=False),
                },
                timeout=STT_TIMEOUT_SECONDS,
            )
            request_format = "multipart"
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        return {
            "text": "",
            "provider": "http",
            "configured": True,
            "endpoint": STT_ENDPOINT,
            "requestFormat": STT_HTTP_FORMAT,
            "timingMs": elapsed_ms(started_at),
            "error": compact_error(error),
            "note": "HTTP-STT-endpointtiin ei saatu kelvollista vastausta.",
        }

    text = first_text(data, ["text", "transcript", "rawTranscript", "server_transcript_raw"])
    note = "HTTP-STT palautti raakatekstin." if text else "HTTP-STT vastasi, mutta tekstikenttä jäi tyhjäksi."
    return {
        "text": text,
        "provider": str(data.get("provider") or "http"),
        "configured": True,
        "endpoint": STT_ENDPOINT,
        "requestFormat": request_format,
        "model": data.get("model") or model,
        "language": data.get("language") or language,
        "languageProbability": data.get("languageProbability"),
        "durationSeconds": data.get("durationSeconds"),
        "segments": data.get("segments", []),
        "asrAttempts": data.get("attempts", []),
        "rawSegmentCount": len(data.get("segments") or []),
        "timingMs": elapsed_ms(started_at),
        "response": {key: value for key, value in data.items() if key != "audio"},
        "note": note,
    }


def get_segment_rejection_reasons(segment: dict[str, Any], is_trailing_segment: bool) -> list[str]:
    text = str(segment.get("text") or "").strip()
    start = float(segment.get("start") or 0.0)
    end = float(segment.get("end") or start)
    duration = max(0.0, end - start)
    text_chars = len(text)
    chars_per_second = text_chars / duration if duration > 0 else None
    avg_log_prob = float(segment.get("avgLogProb") or 0.0)
    no_speech_probability = float(segment.get("noSpeechProbability") or 0.0)
    normalized = text.casefold()
    reasons: list[str] = []

    if not text:
        reasons.append("empty_segment")

    if no_speech_probability >= LOCAL_STT_REJECT_HIGH_NO_SPEECH_PROB:
        reasons.append("high_no_speech_probability")

    if (
        is_trailing_segment
        and duration <= LOCAL_STT_REJECT_SHORT_SEGMENT_MAX_SECONDS
        and text_chars >= LOCAL_STT_REJECT_SHORT_SEGMENT_MIN_CHARS
    ):
        reasons.append("too_much_text_for_short_segment")

    if (
        is_trailing_segment
        and chars_per_second is not None
        and chars_per_second >= LOCAL_STT_REJECT_MAX_CHARS_PER_SECOND
    ):
        reasons.append("trailing_segment_text_density_too_high")

    if is_trailing_segment and avg_log_prob <= LOCAL_STT_REJECT_LOW_AVG_LOGPROB:
        reasons.append("trailing_segment_low_confidence")

    hallucination_markers = [
        "päätöksentekijä",
        "äärimmäisenä puheenvuorona",
        "puhuenvuorona puhuu",
        "kiitos kun katsoit",
        "tekstitys",
        "subtitles",
    ]
    if is_trailing_segment and any(marker in normalized for marker in hallucination_markers):
        reasons.append("known_trailing_hallucination_phrase")

    return reasons


def filter_stt_segments(segments: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    last_index = len(segments) - 1

    for index, segment in enumerate(segments):
        reasons = get_segment_rejection_reasons(segment, index == last_index and index > 0)
        if reasons:
            rejected.append({**segment, "rejectedReasons": reasons})
        else:
            accepted.append(segment)

    return accepted, rejected


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def get_quality_segments(transcription: dict[str, Any]) -> list[dict[str, Any]]:
    segments = transcription.get("segments")
    if isinstance(segments, list):
        return [segment for segment in segments if isinstance(segment, dict)]
    return []


def get_forced_transcript_reasons(text: str) -> list[str]:
    normalized = text.casefold()
    reasons: list[str] = []

    if re.search(r"\b[A-ZÅÄÖ]{2,}\b\s*,\s*[A-ZÅÄÖ][^.!?]{8,}", text):
        reasons.append("acronym_expansion_pattern")

    has_acronym = bool(re.search(r"\b[A-ZÅÄÖ]{2,}\b", text))
    institutional_markers = [
        "ammattikorkeakoulu",
        "koulutus",
        "koulutt",
        "yliopisto",
        "opisto",
    ]
    if has_acronym and any(marker in normalized for marker in institutional_markers):
        reasons.append("out_of_context_institutional_explanation")

    # Do not reject ordinary Finnish questions merely because they contain
    # words that often occur in Whisper's invented explanations.  For example,
    # "Kuka on Suomen presidentti?" and "Mitä datamaturiteetti tarkoittaa?"
    # are valid user utterances.  Keep this list limited to clear media
    # artefacts; the segment and duration checks below still catch long,
    # implausible hallucinations.
    forced_explanation_markers = [
        "tekstitys",
        "subtitles",
        "kiitos kun katsoit",
    ]
    if any(marker in normalized for marker in forced_explanation_markers):
        reasons.append("forced_explanation_phrase")

    return reasons


def evaluate_transcription_quality(payload: dict[str, Any], transcription: dict[str, Any]) -> dict[str, Any]:
    text = str(transcription.get("text") or "").strip()
    segments = get_quality_segments(transcription)
    duration_seconds = get_audio_duration_seconds(payload) or safe_float(transcription.get("durationSeconds"))
    chars_per_second = len(text) / duration_seconds if duration_seconds and duration_seconds > 0 else None
    reasons: list[str] = []
    warnings: list[str] = []

    if not STT_QUALITY_GATE_ENABLED:
        return {
            "enabled": False,
            "accepted": True,
            "status": "accepted",
            "message": None,
            "reasons": [],
            "warnings": [],
            "candidateRejected": None,
        }

    if not text:
        reasons.append("empty_transcript")

    if transcription.get("draftUsed") and transcription.get("audioVerificationSkipped"):
        reasons.append("unverified_browser_draft")

    language_probability = safe_float(transcription.get("languageProbability"))
    if language_probability is not None and language_probability < STT_QUALITY_LOW_LANGUAGE_PROBABILITY:
        reasons.append("low_language_probability")

    avg_log_probs = [
        number
        for number in (safe_float(segment.get("avgLogProb")) for segment in segments)
        if number is not None
    ]
    if avg_log_probs:
        avg_log_prob = sum(avg_log_probs) / len(avg_log_probs)
        if avg_log_prob <= STT_QUALITY_LOW_AVG_LOGPROB:
            reasons.append("low_avg_logprob")
    else:
        avg_log_prob = None

    no_speech_probs = [
        number
        for number in (safe_float(segment.get("noSpeechProbability")) for segment in segments)
        if number is not None
    ]
    max_no_speech_probability = max(no_speech_probs) if no_speech_probs else None
    if max_no_speech_probability is not None and max_no_speech_probability >= STT_QUALITY_HIGH_NO_SPEECH_PROB:
        reasons.append("high_no_speech_probability")

    compression_ratios = [
        number
        for number in (safe_float(segment.get("compressionRatio")) for segment in segments)
        if number is not None
    ]
    max_compression_ratio = max(compression_ratios) if compression_ratios else None
    if max_compression_ratio is not None and max_compression_ratio >= STT_QUALITY_HIGH_COMPRESSION_RATIO:
        reasons.append("high_compression_ratio")

    if (
        chars_per_second is not None
        and duration_seconds is not None
        and duration_seconds >= STT_QUALITY_MIN_DURATION_FOR_DENSITY_SECONDS
        and chars_per_second >= STT_QUALITY_MAX_CHARS_PER_SECOND
    ):
        reasons.append("too_much_text_for_audio_duration")

    reasons.extend(get_forced_transcript_reasons(text))

    rejected_segments = transcription.get("rejectedSegments")
    if isinstance(rejected_segments, list) and rejected_segments:
        warnings.append("segments_rejected_before_quality_gate")

    accepted = len(reasons) == 0
    return {
        "enabled": True,
        "accepted": accepted,
        "status": "accepted" if accepted else "unclear",
        "message": None if accepted else STT_UNCLEAR_TEXT,
        "reasons": sorted(set(reasons)),
        "warnings": sorted(set(warnings)),
        "candidateRejected": None if accepted else text,
        "metrics": {
            "textChars": len(text),
            "durationSeconds": round(duration_seconds, 2) if duration_seconds is not None else None,
            "charsPerSecond": round(chars_per_second, 2) if chars_per_second is not None else None,
            "languageProbability": language_probability,
            "avgLogProb": round(avg_log_prob, 3) if avg_log_prob is not None else None,
            "maxNoSpeechProbability": max_no_speech_probability,
            "maxCompressionRatio": max_compression_ratio,
        },
    }


def transcribe_audio(payload: dict[str, Any], audio_bytes: bytes, allow_http: bool = True) -> dict[str, Any]:
    provider = normalize_stt_provider(STT_PROVIDER)
    draft = get_request_text_draft(payload)
    draft["fastPathDecision"] = get_draft_fast_path_decision(payload, draft)
    attempts: list[dict[str, Any]] = []

    if MOCK_TRANSCRIPT_TEXT:
        return enrich_transcription_debug(
            {
                "text": MOCK_TRANSCRIPT_TEXT,
                "provider": "mock",
                "configured": True,
                "note": "Käytettiin HH_MOCK_TRANSCRIPT_TEXT-kehitystekstiä.",
            },
            attempts,
            draft,
        )

    if draft["fastPathDecision"]["useFastPath"]:
        return enrich_transcription_debug(
            {
                "text": draft["text"],
                "provider": draft["provider"],
                "configured": True,
                "draftUsed": True,
                "draftFastPath": True,
                "audioVerificationSkipped": True,
                "fastPathDecision": draft["fastPathDecision"],
                "note": "Käytettiin selaimen tekstidraftia nopeana vastauksena; raskas Whisper-varmistus ohitettiin tälle chunkille.",
            },
            attempts,
            draft,
        )

    if provider not in {"auto", "http", "local", "request"}:
        attempts.append(
            {
                "provider": provider,
                "configured": False,
                "textChars": 0,
                "error": f"Tuntematon HH_STT_PROVIDER-arvo: {provider}",
                "note": "Sallitut arvot: auto, http, local, request.",
            }
        )

    if allow_http and provider in {"auto", "http"} and STT_ENDPOINT:
        http_result = transcribe_with_http_stt(payload, audio_bytes)
        attempts.append(stt_attempt_summary(http_result))
        if http_result.get("text"):
            return enrich_transcription_debug(http_result, attempts, draft)

    if provider in {"auto", "local"}:
        local_result = transcribe_with_local_faster_whisper(audio_bytes)
        attempts.append(stt_attempt_summary(local_result))
        if local_result.get("text"):
            return enrich_transcription_debug(local_result, attempts, draft)

    if STT_ALLOW_DRAFT_FALLBACK and draft.get("text"):
        return enrich_transcription_debug(
            {
                "text": draft["text"],
                "provider": draft["provider"],
                "configured": False,
                "draftUsed": True,
                "draftFastPath": False,
                "fastPathDecision": draft.get("fastPathDecision"),
                "note": "Varsinainen serveri-STT ei tuottanut tekstiä; käytettiin pyynnön mukana tullutta selaimen tekstidraftia.",
            },
            attempts,
            draft,
        )

    configured_attempt = next((attempt for attempt in attempts if attempt.get("configured")), None)
    provider_name = "no_text" if configured_attempt else "not_configured"
    note = (
        "STT oli konfiguroitu tai sitä yritettiin, mutta se ei palauttanut tunnistettua tekstiä."
        if configured_attempt
        else "Audio vastaanotettiin, mutta HH_STT_ENDPOINT ei ole asetettu eikä paikallinen faster-whisper ole käytettävissä."
    )
    if draft.get("text"):
        note += " Selaimen tekstidraft oli mukana vain vertailua varten eikä sitä käytetty lopullisena tuloksena."

    return enrich_transcription_debug(
        {
            "text": "",
            "provider": provider_name,
            "configured": bool(configured_attempt),
            "fastPathDecision": draft.get("fastPathDecision"),
            "note": note,
        },
        attempts,
        draft,
    )


def interpret_transcript(
    raw_text: str,
    payload: dict[str, Any],
    transcription: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not raw_text.strip():
        transcription = transcription or {}
        normalization = normalize_speech_text("")
        if transcription.get("configured"):
            text = "Audio vastaanotettu ja STT ajettiin, mutta tunnistettava teksti jäi tyhjäksi."
        else:
            text = "Audio vastaanotettu, mutta puheentunnistuspalvelua ei ole vielä määritetty."
        return {
            "text": text,
            "provider": "deterministic",
            "model": None,
            "note": transcription.get("note"),
            "normalization": normalization,
        }

    normalization = normalize_speech_text(raw_text.strip())
    return {
        "text": normalization["text"],
        "provider": "deterministic",
        "model": None,
        "note": "Tulkkikerros palautti STT-tekstin normalisoituna agentille.",
        "normalization": normalization,
        "candidates": build_query_candidates(raw_text.strip(), normalization),
    }


def build_unclear_interpretation(transcription: dict[str, Any], quality: dict[str, Any]) -> dict[str, Any]:
    normalization = normalize_speech_text("")
    reasons = quality.get("reasons") if isinstance(quality.get("reasons"), list) else []
    return {
        "text": STT_UNCLEAR_TEXT,
        "provider": "quality_gate",
        "model": None,
        "note": "Laatuportti hylkäsi STT-ehdokkaan, jotta epävarmaa puhetta ei pakoteta tekstiksi.",
        "normalization": normalization,
        "quality": {
            "status": quality.get("status"),
            "reasons": reasons,
            "candidateRejected": quality.get("candidateRejected"),
            "transcriptionProvider": transcription.get("provider"),
        },
    }


def handle_config_create(payload: dict[str, Any]) -> dict[str, Any]:
    config_id = make_id("cfg")
    tenant_id = str(payload.get("tenantId") or "local-mutinatulkki")
    config = {
        "configId": config_id,
        "version": 1,
        "status": "active",
        "tenantId": tenant_id,
        "config": payload,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    CONFIGS[config_id] = config
    return {
        "configId": config_id,
        "version": 1,
        "status": "active",
        "createdAt": config["createdAt"],
    }


def build_audio_debug(
    payload: dict[str, Any],
    audio: dict[str, Any],
    audio_size_bytes: int,
    checksum: str,
) -> dict[str, Any]:
    metadata = get_metadata(payload)
    duration_ms = (
        get_nested(metadata, ["recording", "chunk", "durationMs"])
        or get_nested(metadata, ["recording", "durationMs"])
    )
    speech_ms = get_nested(metadata, ["recording", "chunk", "speech", "confirmedSpeechMs"])
    rms_peak = get_nested(metadata, ["recording", "chunk", "rmsPeak"])

    return {
        "mimeType": audio.get("mimeType") or "audio/webm",
        "fileName": audio.get("fileName"),
        "decodedSizeBytes": audio_size_bytes,
        "declaredSizeBytes": audio.get("sizeBytes"),
        "base64Chars": len(str(audio.get("base64") or "")),
        "sha256Prefix": checksum[:12],
        "durationMs": duration_ms,
        "speechMs": speech_ms,
        "rmsPeak": rms_peak,
        "chunkIndex": get_chunk_index(payload),
    }


def handle_audio(payload: dict[str, Any]) -> dict[str, Any]:
    request_started_at = time.perf_counter()
    request_id = str(payload.get("requestId") or make_id("req"))
    audio = payload.get("audio")
    if not isinstance(audio, dict):
        raise ValueError("Pyynnöstä puuttuu audio-objekti.")

    decode_started_at = time.perf_counter()
    audio_bytes, checksum = decode_audio(audio)
    decode_ms = elapsed_ms(decode_started_at)
    audio_size_bytes = len(audio_bytes)
    audio_id = make_id("aud")
    job_id = make_id("job")
    tenant_id = str(payload.get("tenantId") or "local-mutinatulkki")
    config_id = str(payload.get("configId") or DEFAULT_CONFIG_ID)
    received_at = now_iso()

    transcribe_started_at = time.perf_counter()
    transcription = transcribe_audio(payload, audio_bytes)
    # Keep the visible raw question free of STT-created word-hyphens as well.
    # Otherwise the UI and the normalized search query would disagree.
    transcription["text"] = remove_artificial_word_hyphens(transcription.get("text", ""))
    transcribe_ms = elapsed_ms(transcribe_started_at)
    quality = evaluate_transcription_quality(payload, transcription)

    interpret_started_at = time.perf_counter()
    if quality.get("accepted"):
        interpretation = interpret_transcript(transcription.get("text", ""), payload, transcription)
        status = "completed"
    else:
        interpretation = build_unclear_interpretation(transcription, quality)
        status = "unclear"
    interpret_ms = elapsed_ms(interpret_started_at)
    text = interpretation.get("text", "").strip()
    total_ms = elapsed_ms(request_started_at)

    # Zero-retention MVP: raw audio bytes are not stored beyond this request.
    del audio_bytes

    print(
        (
            "[{time}] audio requestId={request_id} chunk={chunk} bytes={bytes} "
            "stt={stt} configured={configured} rawChars={raw_chars} textChars={text_chars} totalMs={total_ms}"
        ).format(
            time=time.strftime("%H:%M:%S"),
            request_id=request_id,
            chunk=get_chunk_index(payload),
            bytes=audio_size_bytes,
            stt=transcription.get("provider"),
            configured=transcription.get("configured"),
            raw_chars=len(str(transcription.get("text") or "")),
            text_chars=len(text),
            total_ms=total_ms,
        )
    )
    if status == "unclear":
        print(
            (
                "[{time}] audio requestId={request_id} chunk={chunk} quality=unclear reasons={reasons}"
            ).format(
                time=time.strftime("%H:%M:%S"),
                request_id=request_id,
                chunk=get_chunk_index(payload),
                reasons=",".join(quality.get("reasons", [])),
            )
        )

    return {
        "ok": True,
        "requestId": request_id,
        "audioId": audio_id,
        "jobId": job_id,
        "configId": config_id,
        "tenantId": tenant_id,
        "status": status,
        "receivedAt": received_at,
        "text": text,
        "transcriptText": text,
        "rawTranscript": transcription.get("text", ""),
        "message": quality.get("message"),
        "candidateRejected": quality.get("candidateRejected"),
        "quality": quality,
        "transcription": transcription,
        "interpretation": interpretation,
        "normalization": interpretation.get("normalization"),
        "audio": {
            "mimeType": audio.get("mimeType") or "audio/webm",
            "sizeBytes": audio_size_bytes,
            "sha256": checksum,
            "persisted": False,
            "retention": "memory_only_request_scope",
        },
        "debug": {
            "requestId": request_id,
            "audio": build_audio_debug(payload, audio, audio_size_bytes, checksum),
            "timingsMs": {
                "decode": decode_ms,
                "transcribe": transcribe_ms,
                "interpret": interpret_ms,
                "total": total_ms,
            },
            "stt": {
                "readiness": stt_readiness(),
                "attempts": transcription.get("attempts", []),
            },
        },
        "voiceIdentity": {
            "status": "disabled",
        },
    }


def handle_transcribe(payload: dict[str, Any]) -> dict[str, Any]:
    started_at = time.perf_counter()
    audio = payload.get("audio")
    if not isinstance(audio, dict):
        raise ValueError("Pyynnöstä puuttuu audio-objekti.")

    audio_bytes, checksum = decode_audio(audio)
    audio_size_bytes = len(audio_bytes)
    transcription = transcribe_audio(payload, audio_bytes, allow_http=False)
    quality = evaluate_transcription_quality(payload, transcription)
    del audio_bytes
    accepted = bool(quality.get("accepted"))
    text = transcription.get("text", "") if accepted else ""

    return {
        "ok": True,
        "status": "completed" if accepted else "unclear",
        "text": text,
        "transcript": text,
        "rawTranscript": transcription.get("text", ""),
        "message": quality.get("message"),
        "candidateRejected": quality.get("candidateRejected"),
        "quality": quality,
        "transcription": transcription,
        "audio": {
            "mimeType": audio.get("mimeType") or "audio/webm",
            "sizeBytes": audio_size_bytes,
            "sha256": checksum,
            "persisted": False,
            "retention": "memory_only_request_scope",
        },
        "debug": {
            "audio": build_audio_debug(payload, audio, audio_size_bytes, checksum),
            "timingsMs": {
                "total": elapsed_ms(started_at),
            },
            "stt": {
                "readiness": stt_readiness(),
                "attempts": transcription.get("attempts", []),
            },
        },
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "HH-tulkkiAPI/0.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        print(f"{self.address_string()} - {format % args}")

    def send_json(self, status: int, value: Any) -> None:
        body = json_bytes(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_json(204, {})

    def read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length") or "0")
        if content_length > MAX_BODY_BYTES:
            raise ValueError("Pyyntö on liian suuri.")
        return parse_json_bytes(self.rfile.read(content_length))

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self.send_json(200, {"status": "ok", "service": SERVICE_NAME})
            return

        if self.path == "/readyz":
            self.send_json(
                200,
                {
                    "status": "ready",
                    "service": SERVICE_NAME,
                    "checks": {
                        "stt": stt_readiness(),
                        "normalization": normalization_readiness(),
                    },
                },
            )
            return

        if self.path in {"/debugz", "/api/v1/debug/stt"}:
            self.send_json(
                200,
                {
                    "status": "ok",
                    "service": SERVICE_NAME,
                    "stt": stt_readiness(),
                    "normalization": normalization_readiness(),
                    "limits": {
                        "maxBodyBytes": MAX_BODY_BYTES,
                        "maxAudioFileSizeMb": MAX_AUDIO_FILE_SIZE_MB,
                    },
                },
            )
            return

        if self.path.startswith("/api/v1/configs/"):
            config_id = self.path.rsplit("/", 1)[-1]
            config = CONFIGS.get(config_id)
            if not config:
                self.send_json(404, {"ok": False, "error": "Configia ei löytynyt."})
                return
            self.send_json(200, {"ok": True, **config})
            return

        self.send_json(404, {"ok": False, "error": "Ei löytynyt."})

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = self.read_json_body()

            if self.path == "/api/v1/configs":
                self.send_json(201, {"ok": True, **handle_config_create(payload)})
                return

            if self.path == "/api/v1/audio":
                self.send_json(200, handle_audio(payload))
                return

            if self.path in {"/api/transcribe", "/api/v1/transcribe"}:
                self.send_json(200, handle_transcribe(payload))
                return

            self.send_json(404, {"ok": False, "error": "Ei löytynyt."})
        except ValueError as error:
            self.send_json(400, {"ok": False, "error": str(error)})
        except Exception as error:  # noqa: BLE001
            self.send_json(500, {"ok": False, "error": str(error)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"{SERVICE_NAME} kuuntelee osoitteessa http://{HOST}:{PORT}")
    print(f"STT: {json.dumps(stt_readiness(), ensure_ascii=False)}")
    server.serve_forever()


if __name__ == "__main__":
    main()
