from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from app.config import get_settings
from app.db import connect, row_to_dict, utc_now
from app.schemas import FileDetail, FileRecord, UploadResponse
from app.services.ingestion import ingest_file
from app.services.storage import detect_media_type, public_media_url, save_upload


router = APIRouter(prefix="/files", tags=["files"])


def _build_file_detail(settings, file_id: str) -> FileDetail:
    with connect(settings) as connection:
        file_row = connection.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found.")
        chunk_rows = connection.execute(
            """
            SELECT id, order_index, text, page_number, timestamp_start, timestamp_end
            FROM chunks
            WHERE file_id = ?
            ORDER BY order_index ASC
            LIMIT 50
            """,
            (file_id,),
        ).fetchall()
    file_data = row_to_dict(file_row) or {}
    file_data["chunks"] = [dict(row) for row in chunk_rows]
    file_data["chunk_count"] = len(chunk_rows)
    return FileDetail.model_validate(file_data)


@router.get("", response_model=list[FileRecord], summary="List uploaded files")
def list_files() -> list[FileRecord]:
    settings = get_settings()
    with connect(settings) as connection:
        rows = connection.execute("SELECT * FROM files ORDER BY uploaded_at DESC").fetchall()
    return [FileRecord.model_validate(row_to_dict(row)) for row in rows]


@router.post("/upload", response_model=UploadResponse, summary="Upload a new source file")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> UploadResponse:
    settings = get_settings()
    media_type = detect_media_type(
        file.filename or "",
        file.content_type or "application/octet-stream",
        allow_dev_text_uploads=settings.allow_dev_text_uploads,
    )
    _, stored_name, _ = save_upload(file, settings)

    record = {
        "id": uuid4().hex,
        "filename": file.filename or stored_name,
        "stored_name": stored_name,
        "content_type": file.content_type or "application/octet-stream",
        "media_type": media_type,
        "status": "uploaded",
        "summary": None,
        "error": None,
        "uploaded_at": utc_now(),
        "processed_at": None,
        "duration_seconds": None,
        "page_count": None,
        "transcript_available": 0,
        "media_url": public_media_url(stored_name),
    }

    with connect(settings) as connection:
        connection.execute(
            """
            INSERT INTO files (
                id, filename, stored_name, content_type, media_type, status,
                summary, error, uploaded_at, processed_at, duration_seconds,
                page_count, transcript_available, media_url
            ) VALUES (
                :id, :filename, :stored_name, :content_type, :media_type, :status,
                :summary, :error, :uploaded_at, :processed_at, :duration_seconds,
                :page_count, :transcript_available, :media_url
            )
            """,
            record,
        )

    background_tasks.add_task(ingest_file, record["id"], settings)
    return UploadResponse(file=FileRecord.model_validate({**record, "transcript_available": False}))


@router.get("/{file_id}", response_model=FileDetail, summary="Get file detail and extracted chunks")
def get_file(file_id: str) -> FileDetail:
    settings = get_settings()
    return _build_file_detail(settings, file_id)


@router.post("/{file_id}/reingest", response_model=FileDetail, summary="Re-run ingestion for a file")
def reingest_file(file_id: str, background_tasks: BackgroundTasks) -> FileDetail:
    settings = get_settings()
    with connect(settings) as connection:
        exists = connection.execute("SELECT 1 FROM files WHERE id = ?", (file_id,)).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="File not found.")
    background_tasks.add_task(ingest_file, file_id, settings)
    return _build_file_detail(settings, file_id)
