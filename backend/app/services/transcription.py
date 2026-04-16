from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.config import Settings
from app.services.media import get_duration_seconds, normalize_media


def _format_transcript_units(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for segment in segments:
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        units.append(
            {
                "text": text,
                "page_number": None,
                "timestamp_start": float(segment.get("start", 0.0)),
                "timestamp_end": float(segment.get("end", segment.get("start", 0.0))),
            }
        )
    return units


def _transcribe_with_groq(path: str, settings: Settings) -> list[dict[str, Any]] | None:
    if not settings.groq_api_key:
        return None

    url = f"{settings.groq_base_url.rstrip('/')}/audio/transcriptions"
    with open(path, "rb") as audio_file:
        files = {"file": (Path(path).name, audio_file, "application/octet-stream")}
        data = {
            "model": settings.groq_transcription_model,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "segment",
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
        response = httpx.post(url, headers=headers, data=data, files=files, timeout=120)
        response.raise_for_status()
        payload = response.json()
    return payload.get("segments") or []


def _transcribe_with_faster_whisper(path: str) -> list[dict[str, Any]] | None:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None

    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(path, beam_size=3)
    return [
        {"start": segment.start, "end": segment.end, "text": segment.text}
        for segment in segments
    ]


def transcribe_media_units(path: str, settings: Settings) -> tuple[list[dict[str, Any]], float | None]:
    normalized_path = normalize_media(path)
    segments: list[dict[str, Any]] | None = None
    last_error: Exception | None = None

    try:
        segments = _transcribe_with_groq(normalized_path, settings)
    except Exception as exc:  # pragma: no cover
        last_error = exc

    if not segments:
        try:
            segments = _transcribe_with_faster_whisper(normalized_path)
        except Exception as exc:  # pragma: no cover
            last_error = exc

    if not segments:
        error_message = "Media transcription requires Groq credentials or faster-whisper installed."
        if last_error:
            error_message = f"{error_message} Last error: {last_error}"
        raise RuntimeError(error_message)

    return _format_transcript_units(segments), get_duration_seconds(normalized_path)
