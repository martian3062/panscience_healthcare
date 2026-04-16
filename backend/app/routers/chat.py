from __future__ import annotations

from uuid import uuid4

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.db import connect, utc_now
from app.schemas import ChatHistoryItem, ChatHistoryResponse, ChatRequest, ChatResponse, Citation
from app.services.embeddings import embed_texts
from app.services.llm import answer_question
from app.services.vector_store import VectorStore


router = APIRouter(prefix="/chat", tags=["chat"])


def _lexical_results(question: str, file_ids: list[str], limit: int) -> list[dict]:
    settings = get_settings()
    terms = {term.lower() for term in question.split() if term.strip()}
    with connect(settings) as connection:
        if file_ids:
            placeholders = ",".join("?" for _ in file_ids)
            rows = connection.execute(
                f"""
                SELECT chunks.*, files.filename, files.media_url
                FROM chunks
                JOIN files ON files.id = chunks.file_id
                WHERE chunks.file_id IN ({placeholders})
                """,
                tuple(file_ids),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT chunks.*, files.filename, files.media_url
                FROM chunks
                JOIN files ON files.id = chunks.file_id
                """
            ).fetchall()

    scored: list[dict] = []
    for row in rows:
        text = row["text"].lower()
        overlap = sum(1 for term in terms if term in text)
        if overlap == 0:
            continue
        score = overlap / max(len(terms), 1)
        scored.append({**dict(row), "score": round(score, 4)})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


def _vector_results(question: str, file_ids: list[str], limit: int) -> list[dict]:
    settings = get_settings()
    vector_store = VectorStore(settings)
    if not vector_store.enabled:
        return []

    query_embedding = embed_texts([question], settings.embedding_model)[0]
    items = vector_store.query(query_embedding, limit=limit, file_ids=file_ids)
    if not items:
        return []

    ids = [item["id"] for item in items]
    score_by_id = {item["id"]: item["score"] for item in items}
    placeholders = ",".join("?" for _ in ids)
    with connect(settings) as connection:
        rows = connection.execute(
            f"""
            SELECT chunks.*, files.filename, files.media_url
            FROM chunks
            JOIN files ON files.id = chunks.file_id
            WHERE chunks.id IN ({placeholders})
            """,
            tuple(ids),
        ).fetchall()
    results = []
    for row in rows:
        data = dict(row)
        data["score"] = score_by_id.get(row["id"], 0.0)
        results.append(data)
    results.sort(key=lambda item: item["score"], reverse=True)
    return results


@router.post("/query", response_model=ChatResponse, summary="Ask a grounded question")
def query_chat(request: ChatRequest) -> ChatResponse:
    settings = get_settings()
    vector_hits = _vector_results(request.question, request.file_ids, request.top_k)
    lexical_hits = _lexical_results(request.question, request.file_ids, request.top_k)

    merged: dict[str, dict] = {}
    for hit in vector_hits + lexical_hits:
        existing = merged.get(hit["id"])
        if existing is None or hit["score"] > existing["score"]:
            merged[hit["id"]] = hit
    ordered_hits = sorted(merged.values(), key=lambda item: item["score"], reverse=True)[: request.top_k]

    answer, provider = answer_question(request.question, ordered_hits, settings)
    created_at = utc_now()
    chat_id = uuid4().hex

    with connect(settings) as connection:
        connection.execute(
            "INSERT INTO chats (id, question, answer, provider, created_at) VALUES (?, ?, ?, ?, ?)",
            (chat_id, request.question, answer, provider, created_at),
        )
        connection.executemany(
            "INSERT INTO chat_sources (chat_id, chunk_id) VALUES (?, ?)",
            [(chat_id, hit["id"]) for hit in ordered_hits],
        )

    citations = [
        Citation(
            chunk_id=hit["id"],
            file_id=hit["file_id"],
            file_name=hit["filename"],
            excerpt=hit["text"],
            page_number=hit.get("page_number"),
            timestamp_start=hit.get("timestamp_start"),
            timestamp_end=hit.get("timestamp_end"),
            media_url=hit["media_url"],
            score=hit["score"],
        )
        for hit in ordered_hits
    ]
    return ChatResponse(answer=answer, provider=provider, citations=citations, created_at=created_at)


@router.get("/history", response_model=ChatHistoryResponse, summary="List recent chat history")
def get_history() -> ChatHistoryResponse:
    settings = get_settings()
    with connect(settings) as connection:
        rows = connection.execute(
            "SELECT id, question, answer, provider, created_at FROM chats ORDER BY created_at DESC LIMIT 25"
        ).fetchall()
    items = [ChatHistoryItem.model_validate(dict(row)) for row in rows]
    return ChatHistoryResponse(items=items)


@router.post("/stream", summary="Ask a grounded question and stream the response")
def stream_chat(request: ChatRequest) -> StreamingResponse:  # pragma: no cover
    settings = get_settings()
    vector_hits = _vector_results(request.question, request.file_ids, request.top_k)
    lexical_hits = _lexical_results(request.question, request.file_ids, request.top_k)

    merged: dict[str, dict] = {}
    for hit in vector_hits + lexical_hits:
        existing = merged.get(hit["id"])
        if existing is None or hit["score"] > existing["score"]:
            merged[hit["id"]] = hit
    ordered_hits = sorted(merged.values(), key=lambda item: item["score"], reverse=True)[: request.top_k]

    citations = [
        Citation(
            chunk_id=hit["id"],
            file_id=hit["file_id"],
            file_name=hit["filename"],
            excerpt=hit["text"],
            page_number=hit.get("page_number"),
            timestamp_start=hit.get("timestamp_start"),
            timestamp_end=hit.get("timestamp_end"),
            media_url=hit["media_url"],
            score=hit["score"],
        )
        for hit in ordered_hits
    ]

    def generate():
        from app.services.llm import stream_answer_question
        answer_parts = []
        provider = "stream"
        
        for part in stream_answer_question(request.question, ordered_hits, settings):
            answer_parts.append(part)
            yield f"data: {json.dumps({'type': 'chunk', 'text': part})}\n\n"

        full_answer = "".join(answer_parts)
        created_at = utc_now()
        chat_id = uuid4().hex

        with connect(settings) as connection:
            connection.execute(
                "INSERT INTO chats (id, question, answer, provider, created_at) VALUES (?, ?, ?, ?, ?)",
                (chat_id, request.question, full_answer, provider, created_at),
            )
            connection.executemany(
                "INSERT INTO chat_sources (chat_id, chunk_id) VALUES (?, ?)",
                [(chat_id, hit["id"]) for hit in ordered_hits],
            )
            connection.commit()

        yield f"data: {json.dumps({'type': 'end', 'citations': [c.model_dump() for c in citations], 'created_at': created_at})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

