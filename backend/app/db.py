from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from app.config import Settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    media_type TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    error TEXT,
    uploaded_at TEXT NOT NULL,
    processed_at TEXT,
    duration_seconds REAL,
    page_count INTEGER,
    transcript_available INTEGER DEFAULT 0,
    media_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_number INTEGER,
    timestamp_start REAL,
    timestamp_end REAL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sources (
    chat_id TEXT NOT NULL,
    chunk_id TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db(settings: Settings) -> None:
    with sqlite3.connect(settings.sqlite_path) as connection:
        connection.executescript(SCHEMA)
        connection.commit()


def get_connection(settings: Settings) -> sqlite3.Connection:
    connection = sqlite3.connect(settings.sqlite_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection


@contextmanager
def connect(settings: Settings) -> Iterator[sqlite3.Connection]:
    connection = get_connection(settings)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    data = dict(row)
    if "metadata_json" in data and data["metadata_json"]:
        data["metadata"] = json.loads(data["metadata_json"])
    if "transcript_available" in data:
        data["transcript_available"] = bool(data["transcript_available"])
    return data
