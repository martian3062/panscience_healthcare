import string
from typing import Any

def extract_docx_units(filepath: str) -> tuple[list[dict[str, Any]], int]:
    try:
        import docx
    except ImportError:
        raise RuntimeError("python-docx is not installed.")

    try:
        # Try native modern .docx parsing
        doc = docx.Document(filepath)
        text = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
        if not text.strip():
            # If docx yields no text, it might be heavily formatted or old, try raw strings
            return _extract_raw_strings(filepath)
        return [{"text": text.strip(), "page_number": 1, "timestamp_start": None, "timestamp_end": None}], 1
    except Exception:
        # Fallback for old .doc files or corrupted structural extraction
        return _extract_raw_strings(filepath)

def _extract_raw_strings(filepath: str) -> tuple[list[dict[str, Any]], int]:
    """Graceful degradation to extract printable strings usually contained within old .doc OLE bundles"""
    try:
        with open(filepath, "rb") as f:
            data = f.read()
            printable_chars = set(bytes(string.printable, 'ascii'))
            texts = []
            current = []
            for b in data:
                if b in printable_chars:
                    current.append(chr(b))
                else:
                    if len(current) > 5:
                        texts.append("".join(current))
                    current = []
            if len(current) > 5:
                texts.append("".join(current))
                
            text = " ".join(texts)
            text = " ".join(text.split()) # compress whitespace
            return [{"text": text, "page_number": 1, "timestamp_start": None, "timestamp_end": None}], 1
    except Exception as e:
        raise RuntimeError(f"Could not parse doc/docx source: {e}")
