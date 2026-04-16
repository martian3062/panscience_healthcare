from __future__ import annotations

import json
from pathlib import Path

from app.config import Settings
from app.db import connect, utc_now
from app.services.chunker import chunk_units
from app.services.embeddings import embed_texts
from app.services.llm import summarize_content
from app.services.pdf import extract_pdf_units
from app.services.transcription import transcribe_media_units
from app.services.vector_store import VectorStore


def _read_text_file(path: str) -> list[dict]:
    text = Path(path).read_text(encoding="utf-8", errors="ignore").strip()
    if not text:
        return []
    return [
        {
            "text": text,
            "page_number": 1,
            "timestamp_start": None,
            "timestamp_end": None,
        }
    ]


def _update_status(settings: Settings, file_id: str, status: str, error: str | None = None) -> None:
    with connect(settings) as connection:
        connection.execute(
            "UPDATE files SET status = ?, error = ? WHERE id = ?",
            (status, error, file_id),
        )


def ingest_file(file_id: str, settings: Settings) -> None:
    _update_status(settings, file_id, "processing", None)

    with connect(settings) as connection:
        file_row = connection.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if file_row is None:
            return
        file_data = dict(file_row)

    file_path = str(Path(settings.upload_dir) / file_data["stored_name"])
    media_type = file_data["media_type"]

    try:
        if media_type == "pdf":
            units, page_count = extract_pdf_units(file_path)
            duration_seconds = None
            transcript_available = False
        elif media_type in {"audio", "video"}:
            units, duration_seconds = transcribe_media_units(file_path, settings)
            page_count = None
            transcript_available = True
        elif media_type == "text":
            units = _read_text_file(file_path)
            page_count = 1
            duration_seconds = None
            transcript_available = False
        else:
            raise RuntimeError(f"Unsupported media type: {media_type}")

        if not units:
            raise RuntimeError("No extractable content was found in the file.")

        chunks = chunk_units(
            units,
            max_chars=settings.max_chunk_chars,
            overlap=settings.chunk_overlap_chars,
        )
        embeddings = embed_texts([chunk["text"] for chunk in chunks], settings.embedding_model)
        vector_store = VectorStore(settings)
        vector_store.replace_file_chunks(file_id, chunks, embeddings)
        summary, _ = summarize_content(file_data["filename"], chunks, settings)

        with connect(settings) as connection:
            connection.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))
            connection.executemany(
                """
                INSERT INTO chunks (
                    id, file_id, order_index, text, page_number,
                    timestamp_start, timestamp_end, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        chunk["id"],
                        file_id,
                        chunk["order_index"],
                        chunk["text"],
                        chunk.get("page_number"),
                        chunk.get("timestamp_start"),
                        chunk.get("timestamp_end"),
                        json.dumps(chunk.get("metadata", {})),
                        utc_now(),
                    )
                    for chunk in chunks
                ],
            )
            connection.execute(
                """
                UPDATE files
                SET status = ?, summary = ?, error = NULL, processed_at = ?,
                    duration_seconds = ?, page_count = ?, transcript_available = ?
                WHERE id = ?
                """,
                (
                    "ready",
                    summary,
                    utc_now(),
                    duration_seconds,
                    page_count,
                    int(transcript_available),
                    file_id,
                ),
            )
    except Exception as exc:
        _update_status(settings, file_id, "failed", str(exc))
