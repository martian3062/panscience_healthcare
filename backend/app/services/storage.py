from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.config import Settings


ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".wav": "audio",
    ".mp3": "audio",
    ".m4a": "audio",
    ".ogg": "audio",
    ".mp4": "video",
    ".mov": "video",
    ".mkv": "video",
    ".webm": "video",
    ".txt": "text",
    ".md": "text",
}


def detect_media_type(filename: str, content_type: str, allow_dev_text_uploads: bool = True) -> str:
    suffix = Path(filename).suffix.lower()
    media_type = ALLOWED_EXTENSIONS.get(suffix)
    if media_type == "text" and not allow_dev_text_uploads:
        media_type = None
    if media_type:
        return media_type
    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("video/"):
        return "video"
    if content_type == "application/pdf":
        return "pdf"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported file type. Upload PDF, audio, or video.",
    )


def save_upload(file: UploadFile, settings: Settings) -> tuple[str, str, int]:
    suffix = Path(file.filename or "").suffix.lower()
    destination_name = f"{uuid4().hex}{suffix}"
    destination = Path(settings.upload_dir) / destination_name

    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    size_bytes = destination.stat().st_size
    limit_bytes = settings.upload_size_limit_mb * 1024 * 1024
    if size_bytes > limit_bytes:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.upload_size_limit_mb}MB limit.",
        )

    return str(destination), destination.name, size_bytes


def public_media_url(stored_name: str) -> str:
    return f"/uploads/{stored_name}"
