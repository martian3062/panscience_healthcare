from __future__ import annotations

import re
from uuid import uuid4


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _split_text(text: str, max_chars: int, overlap: int) -> list[str]:
    words = _normalize(text).split()
    if not words:
        return []

    chunks: list[str] = []
    current_words: list[str] = []
    current_length = 0
    step_back_words = max(1, overlap // 6)

    for word in words:
        projected = current_length + len(word) + (1 if current_words else 0)
        if projected <= max_chars:
            current_words.append(word)
            current_length = projected
            continue

        chunks.append(" ".join(current_words))
        current_words = current_words[-step_back_words:] if current_words else []
        current_words.append(word)
        current_length = len(" ".join(current_words))

    if current_words:
        chunks.append(" ".join(current_words))

    return [chunk for chunk in chunks if chunk]


def chunk_units(units: list[dict], max_chars: int, overlap: int) -> list[dict]:
    chunks: list[dict] = []
    order_index = 0
    for unit in units:
        for piece in _split_text(unit["text"], max_chars=max_chars, overlap=overlap):
            chunks.append(
                {
                    "id": uuid4().hex,
                    "order_index": order_index,
                    "text": piece,
                    "page_number": unit.get("page_number"),
                    "timestamp_start": unit.get("timestamp_start"),
                    "timestamp_end": unit.get("timestamp_end"),
                    "metadata": {},
                }
            )
            order_index += 1
    return chunks
