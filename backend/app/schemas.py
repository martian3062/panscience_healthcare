from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


FileStatus = Literal["uploaded", "processing", "ready", "failed"]


class ChunkPreview(BaseModel):
    id: str
    order_index: int
    text: str
    page_number: int | None = None
    timestamp_start: float | None = None
    timestamp_end: float | None = None


class FileRecord(BaseModel):
    id: str
    filename: str
    stored_name: str
    content_type: str
    media_type: str
    status: FileStatus
    summary: str | None = None
    error: str | None = None
    uploaded_at: str
    processed_at: str | None = None
    duration_seconds: float | None = None
    page_count: int | None = None
    transcript_available: bool = False
    media_url: str


class FileDetail(FileRecord):
    chunks: list[ChunkPreview] = Field(default_factory=list)
    chunk_count: int = 0


class UploadResponse(BaseModel):
    file: FileRecord


class Citation(BaseModel):
    chunk_id: str
    file_id: str
    file_name: str
    excerpt: str
    page_number: int | None = None
    timestamp_start: float | None = None
    timestamp_end: float | None = None
    media_url: str
    score: float


class ChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    file_ids: list[str] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1, le=10)


class ChatResponse(BaseModel):
    answer: str
    provider: str
    citations: list[Citation]
    created_at: str


class ChatHistoryItem(BaseModel):
    id: str
    question: str
    answer: str
    provider: str
    created_at: str


class ChatHistoryResponse(BaseModel):
    items: list[ChatHistoryItem]
