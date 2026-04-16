from __future__ import annotations

import re
from typing import Any


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_pdf_units(path: str) -> tuple[list[dict[str, Any]], int]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required for PDF ingestion.") from exc

    document = fitz.open(path)
    units: list[dict[str, Any]] = []
    try:
        for page_index, page in enumerate(document, start=1):
            blocks = page.get_text("blocks", sort=True)
            block_text = " ".join(_clean_text(block[4]) for block in blocks if _clean_text(block[4]))
            if not block_text:
                block_text = _clean_text(page.get_text("text", sort=True))
            if block_text:
                units.append(
                    {
                        "text": block_text,
                        "page_number": page_index,
                        "timestamp_start": None,
                        "timestamp_end": None,
                    }
                )
        return units, len(document)
    finally:
        document.close()
