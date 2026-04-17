from __future__ import annotations

import builtins
import importlib
import sqlite3
import sys
import wave
from io import BytesIO
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db import connect, init_db, row_to_dict, utc_now
from app.routers import chat, files as files_router
from app.schemas import ChatRequest
from app.services import chunker, embeddings, ingestion, llm, media, pdf, docx, storage, transcription, vector_store


def make_settings(tmp_path: Path, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "cors_origins": ["http://localhost:3000"],
        "sqlite_path": str(tmp_path / "app.db"),
        "chroma_path": str(tmp_path / "chroma"),
        "upload_dir": str(tmp_path / "uploads"),
        "rate_limit_per_minute": 0,
        "valid_api_keys": "",
    }
    values.update(overrides)
    settings = Settings(**values)
    settings.ensure_dirs()
    return settings


def insert_file(
    settings: Settings,
    *,
    file_id: str,
    stored_name: str,
    media_type: str,
    filename: str | None = None,
) -> None:
    with connect(settings) as connection:
        connection.execute(
            """
            INSERT INTO files (
                id, filename, stored_name, content_type, media_type, status,
                summary, error, uploaded_at, processed_at, duration_seconds,
                page_count, transcript_available, media_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                file_id,
                filename or stored_name,
                stored_name,
                "application/octet-stream",
                media_type,
                "uploaded",
                None,
                None,
                utc_now(),
                None,
                None,
                None,
                0,
                storage.public_media_url(stored_name),
            ),
        )


def test_settings_db_and_row_helpers(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, cors_origins="http://a.test,http://b.test")
    assert settings.cors_origins == ["http://a.test", "http://b.test"]
    json_settings = make_settings(tmp_path / "json", cors_origins='["http://x.test","http://y.test"]')
    assert json_settings.cors_origins == ["http://x.test", "http://y.test"]
    assert Path(settings.chroma_path).exists()
    assert Path(settings.upload_dir).exists()

    init_db(settings)
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute("CREATE TABLE sample (metadata_json TEXT, transcript_available INTEGER)")
    connection.execute("INSERT INTO sample (metadata_json, transcript_available) VALUES (?, ?)", ('{"topic":"demo"}', 1))
    row = connection.execute("SELECT * FROM sample").fetchone()
    connection.close()

    converted = row_to_dict(row)
    assert converted is not None
    assert converted["transcript_available"] is True
    assert converted["metadata"] == {"topic": "demo"}
    assert row_to_dict(None) is None
    assert "T" in utc_now()


def test_chunker_and_embeddings_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    assert chunker._normalize(" alpha\n beta\tgamma ") == "alpha beta gamma"
    assert chunker._split_text("", max_chars=20, overlap=6) == []

    units = [
        {
            "text": "one two three four five six seven eight nine ten eleven twelve",
            "page_number": 3,
            "timestamp_start": 4.0,
            "timestamp_end": 8.0,
        }
    ]
    chunks = chunker.chunk_units(units, max_chars=18, overlap=6)
    assert len(chunks) >= 3
    assert [chunk["order_index"] for chunk in chunks] == list(range(len(chunks)))
    assert all(chunk["page_number"] == 3 for chunk in chunks)

    monkeypatch.setattr(embeddings, "_load_sentence_transformer", lambda _: None)
    fallback_vectors = embeddings.embed_texts(["Alpha beta", ""], "mini")
    assert len(fallback_vectors) == 2
    assert len(fallback_vectors[0]) == 128
    assert embeddings._tokenize("Hello, Project 7!") == ["hello", "project", "7"]

    class FakeEncoded:
        def tolist(self) -> list[list[float]]:
            return [[0.1, 0.2, 0.3]]

    class FakeModel:
        def encode(self, texts: list[str], normalize_embeddings: bool) -> FakeEncoded:
            assert texts == ["Hi"]
            assert normalize_embeddings is True
            return FakeEncoded()

    monkeypatch.setattr(embeddings, "_load_sentence_transformer", lambda _: FakeModel())
    assert embeddings.embed_texts(["Hi"], "mini") == [[0.1, 0.2, 0.3]]


def test_storage_helpers_and_save_upload_limits(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, upload_size_limit_mb=1)
    assert storage.detect_media_type("demo.pdf", "application/octet-stream") == "pdf"
    assert storage.detect_media_type("clip.bin", "audio/mpeg") == "audio"
    assert storage.detect_media_type("movie.bin", "video/mp4") == "video"
    assert storage.detect_media_type("note.txt", "text/plain") == "text"
    assert storage.detect_media_type("unknown.bin", "application/pdf") == "pdf"
    with pytest.raises(HTTPException):
        storage.detect_media_type("note.txt", "text/plain", allow_dev_text_uploads=False)
    with pytest.raises(HTTPException):
        storage.detect_media_type("archive.zip", "application/zip")

    upload = SimpleNamespace(filename="notes.txt", file=BytesIO(b"hello world"))
    saved_path, stored_name, size_bytes = storage.save_upload(upload, settings)
    assert Path(saved_path).exists()
    assert stored_name.endswith(".txt")
    assert size_bytes == 11
    assert storage.public_media_url(stored_name) == f"/uploads/{stored_name}"

    oversized_settings = make_settings(tmp_path / "oversized", upload_size_limit_mb=0)
    too_large = SimpleNamespace(filename="big.txt", file=BytesIO(b"abc"))
    with pytest.raises(HTTPException) as exc:
        storage.save_upload(too_large, oversized_settings)
    assert exc.value.status_code == 413


def test_media_normalization_and_duration(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    source = tmp_path / "clip.mp3"
    source.write_bytes(b"demo")

    monkeypatch.setattr(media.shutil, "which", lambda name: "ffmpeg.exe")
    assert media.has_ffmpeg() is True

    monkeypatch.setattr(media, "has_ffmpeg", lambda: False)
    assert media.normalize_media(str(source)) == str(source)

    monkeypatch.setattr(media, "has_ffmpeg", lambda: True)
    monkeypatch.setattr(media.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=1))
    assert media.normalize_media(str(source)) == str(source)

    monkeypatch.setattr(media.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=0))
    normalized = media.normalize_media(str(source))
    assert normalized.endswith(".normalized.wav")

    wav_path = tmp_path / "sample.wav"
    with wave.open(str(wav_path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(16000)
        handle.writeframes(b"\x00\x00" * 16000)

    assert media.get_duration_seconds(str(wav_path)) == 1.0
    assert media.get_duration_seconds(str(tmp_path / "missing.wav")) is None
    assert media.get_duration_seconds(str(source)) is None
    broken_wav = tmp_path / "broken.wav"
    broken_wav.write_bytes(b"not-a-wav")
    assert media.get_duration_seconds(str(broken_wav)) is None


def test_llm_openai_compatible_and_fallback_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    def make_response(payload: dict) -> SimpleNamespace:
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: payload,
        )

    monkeypatch.setattr(
        llm.httpx,
        "post",
        lambda *args, **kwargs: make_response({"choices": [{"message": {"content": "plain answer"}}]}),
    )
    assert (
        llm._openai_compatible_chat(
            base_url="http://example.test",
            model="demo",
            system_prompt="sys",
            user_prompt="user",
        )
        == "plain answer"
    )

    monkeypatch.setattr(
        llm.httpx,
        "post",
        lambda *args, **kwargs: make_response(
            {"choices": [{"message": {"content": [{"text": "part 1 "}, {"text": "part 2"}]}}]}
        ),
    )
    assert (
        llm._openai_compatible_chat(
            base_url="http://example.test",
            model="demo",
            system_prompt="sys",
            user_prompt="user",
            api_key="secret",
        )
        == "part 1 part 2"
    )

    assert llm._trim_excerpt("short text", max_chars=20) == "short text"
    assert llm._trim_excerpt("a" * 50, max_chars=12).endswith("...")
    context = llm._build_context(
        [
            {
                "text": "evidence",
                "page_number": 4,
                "timestamp_start": 1.2,
                "timestamp_end": 2.4,
                "filename": "report.pdf",
            }
        ]
    )
    assert "page 4" in context and "timestamp 1.2s-2.4s" in context

    settings = Settings(groq_api_key="gsk-demo")
    answer, provider = llm.answer_question("Anything?", [], settings)
    assert provider == "no-context"
    assert "could not find" in answer.lower()

    calls: list[str] = []

    def fake_chat(**kwargs: str) -> str:
        calls.append(kwargs["base_url"])
        if len(calls) == 1:
            raise RuntimeError("groq unavailable")
        return "ollama answer"

    monkeypatch.setattr(llm, "_openai_compatible_chat", fake_chat)
    answer, provider = llm.answer_question(
        "What happened?",
        [{"text": "The system created embeddings.", "filename": "notes.txt"}],
        settings,
    )
    assert answer == "ollama answer"
    assert provider == "ollama"

    monkeypatch.setattr(llm, "_openai_compatible_chat", lambda **kwargs: "groq summary")
    summary, provider = llm.summarize_content("notes.txt", [{"text": "Useful content."}], settings)
    assert summary == "groq summary"
    assert provider == "groq"

    def failing_chat(**kwargs: str) -> str:
        raise RuntimeError("all down")

    monkeypatch.setattr(llm, "_openai_compatible_chat", failing_chat)
    empty_summary, empty_provider = llm.summarize_content("notes.txt", [], settings)
    assert empty_provider == "no-context"
    assert "No content" in empty_summary
    fallback_summary, provider = llm.summarize_content(
        "notes.txt",
        [{"text": "one"}, {"text": "two"}, {"text": "three"}],
        settings,
    )
    assert provider == "extractive-fallback"
    assert "one" in fallback_summary
    fallback_answer, provider = llm.answer_question(
        "What happened?",
        [{"text": "Evidence chunk", "filename": "notes.txt"}],
        settings,
    )
    assert provider == "extractive-fallback"
    assert "Evidence" in fallback_answer


def test_pdf_and_transcription_helpers(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    real_import = builtins.__import__

    def import_without_fitz(name: str, *args: object, **kwargs: object):
        if name == "fitz":
            raise ImportError("no fitz")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_fitz)
    with pytest.raises(RuntimeError):
        pdf.extract_pdf_units("missing.pdf")
    monkeypatch.setattr(builtins, "__import__", real_import)

    class FakePage:
        def __init__(self, blocks: list[tuple], fallback_text: str) -> None:
            self.blocks = blocks
            self.fallback_text = fallback_text

        def get_text(self, mode: str, sort: bool = True):
            if mode == "blocks":
                return self.blocks
            return self.fallback_text

    class FakeDocument:
        def __init__(self, pages: list[FakePage]) -> None:
            self.pages = pages
            self.closed = False

        def __iter__(self):
            return iter(self.pages)

        def __len__(self) -> int:
            return len(self.pages)

        def close(self) -> None:
            self.closed = True

    fake_document = FakeDocument(
        [
            FakePage([(0, 0, 0, 0, " First block ")], ""),
            FakePage([], " Fallback page text "),
        ]
    )
    monkeypatch.setitem(sys.modules, "fitz", SimpleNamespace(open=lambda path: fake_document))
    units, page_count = pdf.extract_pdf_units("demo.pdf")
    assert page_count == 2
    assert units[0]["text"] == "First block"
    assert units[1]["text"] == "Fallback page text"
    assert fake_document.closed is True

    # DOCX tests
    docx_path = tmp_path / "valid.docx"
    docx_path.write_bytes(b"PK\x03\x04")
    
    class FakeDocxPara:
        def __init__(self, text):
            self.text = text
            
    class FakeDocxDoc:
        def __init__(self, filepath):
            self.paragraphs = [FakeDocxPara("Hello world"), FakeDocxPara(" ")]
            
    fake_docx_mod = ModuleType("docx")
    fake_docx_mod.Document = FakeDocxDoc
    monkeypatch.setitem(sys.modules, "docx", fake_docx_mod)
    
    units, count = docx.extract_docx_units(str(docx_path))
    assert count == 1
    assert units[0]["text"] == "Hello world"
    
    class FakeEmptyDocxDoc:
        def __init__(self, filepath):
            self.paragraphs = []
    
    fake_docx_mod.Document = FakeEmptyDocxDoc
    doc_path = tmp_path / "old.doc"
    doc_path.write_bytes(b"\x00\x00Hello doc\x00\x00")
    units, count = docx.extract_docx_units(str(doc_path))
    assert count == 1
    assert units[0]["text"] == "Hello doc"
    
    fake_docx_mod.Document = lambda fp: (_ for _ in ()).throw(RuntimeError("corrupted"))
    units, count = docx.extract_docx_units(str(doc_path))
    assert count == 1
    assert units[0]["text"] == "Hello doc"

    monkeypatch.delitem(sys.modules, "docx", raising=False)
    def import_without_docx(name: str, *args: object, **kwargs: object):
        if name == "docx":
            raise ImportError("no docx")
        return real_import(name, *args, **kwargs)
    monkeypatch.setattr(builtins, "__import__", import_without_docx)
    with pytest.raises(RuntimeError):
        docx.extract_docx_units(str(docx_path))
    monkeypatch.setattr(builtins, "__import__", real_import)

    segments = transcription._format_transcript_units(
        [
            {"text": " segment one ", "start": 1.0, "end": 2.0},
            {"text": "   ", "start": 2.0, "end": 3.0},
        ]
    )
    assert segments == [
        {
            "text": "segment one",
            "page_number": None,
            "timestamp_start": 1.0,
            "timestamp_end": 2.0,
        }
    ]

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake-audio")
    settings = Settings(groq_api_key="gsk-demo")

    class FakeTranscriptResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, list[dict[str, object]]]:
            return {"segments": [{"start": 0.0, "end": 1.0, "text": "hello"}]}

    monkeypatch.setattr(transcription.httpx, "post", lambda *args, **kwargs: FakeTranscriptResponse())
    assert transcription._transcribe_with_groq(str(audio_path), settings) == [
        {"start": 0.0, "end": 1.0, "text": "hello"}
    ]
    assert transcription._transcribe_with_groq(str(audio_path), Settings(groq_api_key=None)) is None

    class FakeSegment:
        def __init__(self, start: float, end: float, text: str) -> None:
            self.start = start
            self.end = end
            self.text = text

    class FakeWhisperModel:
        def __init__(self, model_name: str, device: str, compute_type: str) -> None:
            assert model_name == "base"
            assert device == "cpu"
            assert compute_type == "int8"

        def transcribe(self, path: str, beam_size: int):
            assert beam_size == 3
            return [FakeSegment(1.0, 2.5, "world")], None

    fake_whisper_module = ModuleType("faster_whisper")
    fake_whisper_module.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper_module)
    assert transcription._transcribe_with_faster_whisper(str(audio_path)) == [
        {"start": 1.0, "end": 2.5, "text": "world"}
    ]
    monkeypatch.delitem(sys.modules, "faster_whisper", raising=False)

    def import_without_whisper(name: str, *args: object, **kwargs: object):
        if name == "faster_whisper":
            raise ImportError("missing whisper")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_whisper)
    assert transcription._transcribe_with_faster_whisper(str(audio_path)) is None
    monkeypatch.setattr(builtins, "__import__", real_import)

    monkeypatch.setattr(transcription, "normalize_media", lambda path: path)
    monkeypatch.setattr(transcription, "get_duration_seconds", lambda path: 9.5)
    monkeypatch.setattr(transcription, "_transcribe_with_groq", lambda path, settings: [{"start": 0.0, "end": 1.0, "text": "hi"}])
    units, duration = transcription.transcribe_media_units(str(audio_path), settings)
    assert duration == 9.5
    assert units[0]["timestamp_start"] == 0.0

    monkeypatch.setattr(transcription, "_transcribe_with_groq", lambda path, settings: (_ for _ in ()).throw(RuntimeError("groq down")))
    monkeypatch.setattr(transcription, "_transcribe_with_faster_whisper", lambda path: [{"start": 2.0, "end": 4.0, "text": "fallback"}])
    units, duration = transcription.transcribe_media_units(str(audio_path), settings)
    assert units[0]["text"] == "fallback"
    assert duration == 9.5

    monkeypatch.setattr(transcription, "_transcribe_with_groq", lambda path, settings: None)
    monkeypatch.setattr(transcription, "_transcribe_with_faster_whisper", lambda path: None)
    with pytest.raises(RuntimeError):
        transcription.transcribe_media_units(str(audio_path), settings)

    monkeypatch.setattr(transcription, "_transcribe_with_groq", lambda path, settings: (_ for _ in ()).throw(RuntimeError("groq exploded")))
    monkeypatch.setattr(transcription, "_transcribe_with_faster_whisper", lambda path: (_ for _ in ()).throw(RuntimeError("whisper exploded")))
    with pytest.raises(RuntimeError) as exc:
        transcription.transcribe_media_units(str(audio_path), settings)
    assert "Last error" in str(exc.value)


def test_vector_store_enabled_disabled_and_queries(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    settings = make_settings(tmp_path)

    real_import = builtins.__import__

    def import_without_chromadb(name: str, *args: object, **kwargs: object):
        if name == "chromadb":
            raise ImportError("no chromadb")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_chromadb)
    disabled_store = vector_store.VectorStore(settings)
    assert disabled_store.enabled is False
    assert disabled_store.replace_file_chunks("file-1", [], []) is False
    assert disabled_store.query([0.1, 0.2], limit=2, file_ids=[]) == []
    monkeypatch.setattr(builtins, "__import__", real_import)

    class FakeCollection:
        def __init__(self) -> None:
            self.deleted_where = None
            self.add_payload = None
            self.query_payload = None

        def delete(self, where: dict[str, object]) -> None:
            self.deleted_where = where
            raise RuntimeError("ignore delete failure")

        def add(self, **kwargs: object) -> None:
            self.add_payload = kwargs

        def query(self, **kwargs: object) -> dict[str, list[list[object]]]:
            self.query_payload = kwargs
            return {"ids": [["chunk-1", "chunk-2"]], "distances": [[0.1, 0.75]]}

    class FakeClient:
        def __init__(self, path: str) -> None:
            self.path = path
            self.collection = FakeCollection()

        def get_or_create_collection(self, name: str) -> FakeCollection:
            assert name == "assignment_chunks"
            return self.collection

    fake_client_holder: dict[str, FakeClient] = {}

    def fake_persistent_client(path: str) -> FakeClient:
        client = FakeClient(path)
        fake_client_holder["client"] = client
        return client

    fake_chromadb = ModuleType("chromadb")
    fake_chromadb.PersistentClient = fake_persistent_client
    monkeypatch.setitem(sys.modules, "chromadb", fake_chromadb)

    enabled_store = vector_store.VectorStore(settings)
    assert enabled_store.enabled is True
    assert enabled_store.replace_file_chunks(
        "file-1",
        [{"id": "chunk-1", "text": "demo", "page_number": 2, "timestamp_start": None, "timestamp_end": None}],
        [[0.1, 0.2]],
    )
    fake_collection = fake_client_holder["client"].collection
    assert fake_collection.deleted_where == {"file_id": "file-1"}
    assert fake_collection.add_payload is not None
    assert fake_collection.add_payload["ids"] == ["chunk-1"]

    results = enabled_store.query([0.2, 0.8], limit=2, file_ids=["file-1", "file-2"])
    assert results == [
        {"id": "chunk-1", "score": 0.9},
        {"id": "chunk-2", "score": 0.25},
    ]
    assert fake_collection.query_payload is not None
    assert fake_collection.query_payload["where"] == {"file_id": {"$in": ["file-1", "file-2"]}}
    enabled_store.query([0.2, 0.8], limit=1, file_ids=["file-1"])
    assert fake_collection.query_payload["where"] == {"file_id": "file-1"}


def test_ingestion_success_and_failure_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    init_db(settings)

    class FakeVectorStore:
        def __init__(self, settings: Settings) -> None:
            self.replaced: list[tuple[str, list[dict], list[list[float]]]] = []

        def replace_file_chunks(self, file_id: str, chunks: list[dict], embeddings_data: list[list[float]]) -> bool:
            self.replaced.append((file_id, chunks, embeddings_data))
            return True

    fake_store = FakeVectorStore(settings)
    monkeypatch.setattr(ingestion, "VectorStore", lambda settings: fake_store)
    monkeypatch.setattr(ingestion, "embed_texts", lambda texts, model_name: [[0.3, 0.4] for _ in texts])
    monkeypatch.setattr(ingestion, "summarize_content", lambda filename, chunks, settings: ("short summary", "groq"))

    text_file = Path(settings.upload_dir) / "notes.txt"
    text_file.write_text("A text file for ingestion.")
    insert_file(settings, file_id="text-file", stored_name="notes.txt", media_type="text")
    ingestion.ingest_file("text-file", settings)

    with connect(settings) as connection:
        text_row = connection.execute("SELECT * FROM files WHERE id = ?", ("text-file",)).fetchone()
        chunk_count = connection.execute("SELECT COUNT(*) FROM chunks WHERE file_id = ?", ("text-file",)).fetchone()[0]
    assert text_row["status"] == "ready"
    assert text_row["summary"] == "short summary"
    assert chunk_count >= 1
    assert fake_store.replaced

    pdf_file = Path(settings.upload_dir) / "report.pdf"
    pdf_file.write_bytes(b"%PDF-demo")
    insert_file(settings, file_id="pdf-file", stored_name="report.pdf", media_type="pdf")
    monkeypatch.setattr(
        ingestion,
        "extract_pdf_units",
        lambda path: (
            [{"text": "Page one content", "page_number": 1, "timestamp_start": None, "timestamp_end": None}],
            1,
        ),
    )
    ingestion.ingest_file("pdf-file", settings)
    with connect(settings) as connection:
        pdf_row = connection.execute("SELECT * FROM files WHERE id = ?", ("pdf-file",)).fetchone()
    assert pdf_row["status"] == "ready"
    assert pdf_row["page_count"] == 1

    audio_file = Path(settings.upload_dir) / "call.mp3"
    audio_file.write_bytes(b"audio")
    insert_file(settings, file_id="audio-file", stored_name="call.mp3", media_type="audio")
    monkeypatch.setattr(
        ingestion,
        "transcribe_media_units",
        lambda path, settings: (
            [{"text": "Audio transcript", "page_number": None, "timestamp_start": 2.0, "timestamp_end": 5.0}],
            12.4,
        ),
    )
    ingestion.ingest_file("audio-file", settings)
    with connect(settings) as connection:
        audio_row = connection.execute("SELECT * FROM files WHERE id = ?", ("audio-file",)).fetchone()
    assert audio_row["status"] == "ready"
    assert audio_row["transcript_available"] == 1
    assert audio_row["duration_seconds"] == 12.4

    bad_file = Path(settings.upload_dir) / "broken.bin"
    bad_file.write_bytes(b"x")
    insert_file(settings, file_id="bad-file", stored_name="broken.bin", media_type="binary")
    ingestion.ingest_file("bad-file", settings)
    with connect(settings) as connection:
        bad_row = connection.execute("SELECT * FROM files WHERE id = ?", ("bad-file",)).fetchone()
    assert bad_row["status"] == "failed"
    assert "Unsupported media type" in bad_row["error"]

    ingestion.ingest_file("missing-file", settings)


def test_router_helpers_cover_success_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    init_db(settings)
    monkeypatch.setattr(files_router, "get_settings", lambda: settings)
    monkeypatch.setattr(chat, "get_settings", lambda: settings)

    insert_file(settings, file_id="file-1", stored_name="notes.txt", media_type="text", filename="notes.txt")
    with connect(settings) as connection:
        connection.execute(
            """
            INSERT INTO chunks (
                id, file_id, order_index, text, page_number,
                timestamp_start, timestamp_end, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("chunk-1", "file-1", 0, "The system creates embeddings and summaries.", 1, 5.0, 8.0, "{}", utc_now()),
        )

    listed = files_router.list_files()
    assert len(listed) == 1
    detailed = files_router.get_file("file-1")
    assert detailed.chunk_count == 1
    assert detailed.chunks[0].text.startswith("The system")

    background_tasks = BackgroundTasks()
    response = files_router.reingest_file("file-1", background_tasks)
    assert response.id == "file-1"
    assert len(background_tasks.tasks) == 1

    with pytest.raises(HTTPException):
        files_router._build_file_detail(settings, "missing-file")

    lexical_hits = chat._lexical_results("system embeddings", [], 5)
    assert lexical_hits
    assert lexical_hits[0]["filename"] == "notes.txt"

    class FakeVectorStore:
        def __init__(self, settings: Settings) -> None:
            self.enabled = True

        def query(self, query_embedding: list[float], limit: int, file_ids: list[str]) -> list[dict[str, object]]:
            return [{"id": "chunk-1", "score": 0.91}]

    monkeypatch.setattr(chat, "VectorStore", FakeVectorStore)
    monkeypatch.setattr(chat, "embed_texts", lambda texts, model_name: [[0.4, 0.6]])
    vector_hits = chat._vector_results("What does it create?", ["file-1"], 3)
    assert vector_hits[0]["id"] == "chunk-1"
    assert vector_hits[0]["score"] == 0.91

    monkeypatch.setattr(chat, "answer_question", lambda question, chunks, settings: ("Grounded answer", "groq"))
    payload = chat.query_chat(ChatRequest(question="What does it create?", file_ids=["file-1"], top_k=3))
    assert payload.answer == "Grounded answer"
    assert payload.citations[0].chunk_id == "chunk-1"
    history = chat.get_history()
    assert len(history.items) == 1


def test_api_health_docs_and_route_errors(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "app.db"))
    monkeypatch.setenv("CHROMA_PATH", str(tmp_path / "chroma"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    get_settings.cache_clear()
    init_db(Settings())

    import app.main as main_module

    main_module = importlib.reload(main_module)
    app = main_module.app

    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").status_code == 200
        assert client.get("/api/files/missing").status_code == 404
        assert client.post("/api/files/missing/reingest").status_code == 404

        upload_response = client.post(
            "/api/files/upload",
            files={"file": ("archive.zip", BytesIO(b"zip"), "application/zip")},
        )
        assert upload_response.status_code == 400

        invalid_question = client.post("/api/chat/query", json={"question": "hi", "file_ids": []})
        assert invalid_question.status_code == 422

        no_context = client.post("/api/chat/query", json={"question": "What is here?", "file_ids": []})
        assert no_context.status_code == 200
        payload = no_context.json()
        assert payload["provider"] == "no-context"
        assert payload["citations"] == []
