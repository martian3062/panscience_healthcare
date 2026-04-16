from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient


def test_upload_ingest_and_query(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "app.db"))
    monkeypatch.setenv("CHROMA_PATH", str(tmp_path / "chroma"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "0")
    monkeypatch.setenv("VALID_API_KEYS", "")

    from app.config import get_settings

    get_settings.cache_clear()

    from app.main import app

    with TestClient(app) as client:
        response = client.post(
            "/api/files/upload",
            files={
                "file": (
                    "notes.txt",
                    BytesIO(
                        b"The project ingests PDF audio and video files. "
                        b"It creates embeddings, summaries, and timestamp-aware answers."
                    ),
                    "text/plain",
                )
            },
        )
        assert response.status_code == 200
        file_id = response.json()["file"]["id"]

        file_response = client.get(f"/api/files/{file_id}")
        assert file_response.status_code == 200
        file_payload = file_response.json()
        assert file_payload["status"] == "ready"
        assert file_payload["chunk_count"] >= 1

        chat_response = client.post(
            "/api/chat/query",
            json={"question": "What does the project create?", "file_ids": [file_id]},
        )
        assert chat_response.status_code == 200
        payload = chat_response.json()
        assert "embeddings" in payload["answer"].lower() or payload["citations"]

        history_response = client.get("/api/chat/history")
        assert history_response.status_code == 200
        assert len(history_response.json()["items"]) == 1
