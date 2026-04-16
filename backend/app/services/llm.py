from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import Settings


def _trim_excerpt(text: str, max_chars: int = 260) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= max_chars:
        return compact
    return f"{compact[: max_chars - 3].rstrip()}..."


def _openai_compatible_chat(
    *,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    api_key: str | None = None,
) -> str:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    response = httpx.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers=headers,
        json=payload,
        timeout=90,
    )
    response.raise_for_status()
    data = response.json()
    message = data["choices"][0]["message"]["content"]
    if isinstance(message, list):
        return "".join(part.get("text", "") for part in message if isinstance(part, dict))
    return str(message)


def _openai_compatible_chat_stream(  # pragma: no cover
    *,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    api_key: str | None = None,
):
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "temperature": 0.2,
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    with httpx.stream(
        "POST",
        f"{base_url.rstrip('/')}/chat/completions",
        headers=headers,
        json=payload,
        timeout=90,
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line:
                continue
            if line.startswith("data: "):
                line = line[6:]
            if line == "[DONE]":
                break
            try:
                data = json.loads(line)
                if "choices" in data and len(data["choices"]) > 0:
                    delta = data["choices"][0].get("delta", {})
                    if "content" in delta:
                        yield delta["content"]
            except json.JSONDecodeError:
                pass


def _build_context(chunks: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for chunk in chunks:
        location_parts: list[str] = []
        if chunk.get("page_number"):
            location_parts.append(f"page {chunk['page_number']}")
        if chunk.get("timestamp_start") is not None:
            start = round(float(chunk["timestamp_start"]), 2)
            end = round(float(chunk.get("timestamp_end") or start), 2)
            location_parts.append(f"timestamp {start}s-{end}s")
        location = ", ".join(location_parts) or "location unknown"
        source_name = chunk.get("filename") or chunk.get("file_name") or "source"
        lines.append(f"[{source_name} | {location}] {chunk['text']}")
    return "\n".join(lines)


def _fallback_answer(question: str, chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return "I could not find relevant content in the indexed files."

    lead = "Here is the most relevant grounded answer I could assemble from the indexed content."
    evidence = []
    for chunk in chunks[:3]:
        evidence.append(f"- {_trim_excerpt(chunk['text'], 220)}")
    return f"{lead}\n\nQuestion: {question}\n\nEvidence:\n" + "\n".join(evidence)


def answer_question(question: str, chunks: list[dict[str, Any]], settings: Settings) -> tuple[str, str]:
    if not chunks:
        return "I could not find relevant content in the indexed files.", "no-context"

    system_prompt = (
        "You answer questions using only the provided context. "
        "Be concise, accurate, and mention uncertainty when context is incomplete."
    )
    user_prompt = (
        f"Question:\n{question}\n\n"
        f"Context:\n{_build_context(chunks)}\n\n"
        "Write a direct answer. Do not invent facts that are not in the context."
    )

    if settings.groq_api_key:
        try:
            answer = _openai_compatible_chat(
                base_url=settings.groq_base_url,
                model=settings.groq_chat_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                api_key=settings.groq_api_key,
            )
            return answer, "groq"
        except Exception:
            pass

    try:
        answer = _openai_compatible_chat(
            base_url=settings.ollama_base_url,
            model=settings.ollama_chat_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            api_key=None,
        )
        return answer, "ollama"
    except Exception:
        pass

    return _fallback_answer(question, chunks), "extractive-fallback"


def stream_answer_question(question: str, chunks: list[dict[str, Any]], settings: Settings):  # pragma: no cover
    if not chunks:
        yield "I could not find relevant content in the indexed files."
        return

    system_prompt = (
        "You answer questions using only the provided context. "
        "Be concise, accurate, and mention uncertainty when context is incomplete."
    )
    user_prompt = (
        f"Question:\n{question}\n\n"
        f"Context:\n{_build_context(chunks)}\n\n"
        "Write a direct answer. Do not invent facts that are not in the context."
    )

    if settings.groq_api_key:
        try:
            for chunk in _openai_compatible_chat_stream(
                base_url=settings.groq_base_url,
                model=settings.groq_chat_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                api_key=settings.groq_api_key,
            ):
                yield chunk
            return
        except Exception:
            pass

    try:
        for chunk in _openai_compatible_chat_stream(
            base_url=settings.ollama_base_url,
            model=settings.ollama_chat_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            api_key=None,
        ):
            yield chunk
        return
    except Exception:
        pass

    yield _fallback_answer(question, chunks)


def summarize_content(filename: str, chunks: list[dict[str, Any]], settings: Settings) -> tuple[str, str]:
    if not chunks:
        return "No content was indexed for this file.", "no-context"

    system_prompt = "You write short, informative summaries grounded in the provided content."
    user_prompt = (
        f"Summarize the uploaded file named {filename}. "
        f"Keep it under 120 words and mention the main topics.\n\n"
        f"Context:\n{_build_context(chunks[:6])}"
    )

    if settings.groq_api_key:
        try:
            return (
                _openai_compatible_chat(
                    base_url=settings.groq_base_url,
                    model=settings.groq_chat_model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    api_key=settings.groq_api_key,
                ),
                "groq",
            )
        except Exception:
            pass

    try:
        return (
            _openai_compatible_chat(
                base_url=settings.ollama_base_url,
                model=settings.ollama_chat_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                api_key=None,
            ),
            "ollama",
        )
    except Exception:
        pass

    summary_sentences = [_trim_excerpt(chunk["text"], 160) for chunk in chunks[:3]]
    return " ".join(summary_sentences), "extractive-fallback"
