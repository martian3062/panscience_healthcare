from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.config import Settings
from app.services.media import get_duration_seconds, normalize_media

def _transcribe_with_faster_whisper(path: str) -> list[dict[str, Any]] | None:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments_gen, _ = model.transcribe(path, beam_size=3)
    segments = []
    for s in segments_gen:
        segments.append({"start": float(s.start), "end": float(s.end), "text": str(s.text)})
    return segments


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

    import subprocess
    import os
    
    file_to_upload = path
    file_size_bytes = Path(path).stat().st_size
    
    # Groq imposes a strict 25MB limit. If file is >20MB, compress it via ffmpeg.
    compressed_path = None
    if file_size_bytes > 20 * 1024 * 1024:
        compressed_path = Path(path).with_suffix(".compressed.mp3")
        subprocess.run(["ffmpeg", "-y", "-i", path, "-b:a", "32k", str(compressed_path)], capture_output=True)
        if compressed_path.exists() and compressed_path.stat().st_size > 0:
            file_to_upload = str(compressed_path)

    url = f"{settings.groq_base_url.rstrip('/')}/audio/transcriptions"
    
    # Multimodel fallback approach to ensure robustness
    models_to_try = [
        settings.groq_transcription_model,
        "whisper-large-v3-turbo",
        "distil-whisper-large-v3-en",
        "whisper-large-v3"
    ]
    
    # Deduplicate models preserving order
    unique_models = []
    for m in models_to_try:
        if m and m not in unique_models:
            unique_models.append(m)

    payload = None
    last_err = None

    try:
        for model_name in unique_models:
            try:
                with open(file_to_upload, "rb") as audio_file:
                    files = {"file": (Path(file_to_upload).name, audio_file, "audio/mpeg" if file_to_upload.endswith(".mp3") else "application/octet-stream")}
                    data = {
                        "model": model_name,
                        "response_format": "verbose_json",
                        # Removed timestamp_granularities[] which causes 400 Bad Request on some Groq endpoints
                    }
                    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
                    response = httpx.post(url, headers=headers, data=data, files=files, timeout=300)
                    response.raise_for_status()
                    payload = response.json()
                    break # Success, exit the fallback loop
            except httpx.HTTPStatusError as e:
                last_err = e
                continue # Model failed, try the next fallback model
            except httpx.RequestError as e:
                last_err = e
                continue

        if payload is None:
            if last_err and hasattr(last_err, 'response'):
                raise RuntimeError(f"All Groq fallback models failed. Last error: {last_err.response.text}")
            raise last_err or RuntimeError("All Groq fallback models failed without specific errors.")

    finally:
        if compressed_path and compressed_path.exists():
            try:
                os.remove(compressed_path)
            except Exception:
                pass

    return payload.get("segments") or []


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
        error_message = "Transcription failed. Please check your Groq API key."
        if last_error:
            error_message = f"{error_message} Last error: {last_error}"
        raise RuntimeError(error_message)

    return _format_transcript_units(segments), get_duration_seconds(normalized_path)
