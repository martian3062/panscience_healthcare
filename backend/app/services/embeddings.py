from __future__ import annotations

import math
import re
from functools import lru_cache

import numpy as np


TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text)]


def _hash_embed(text: str, dimensions: int = 128) -> list[float]:
    vector = np.zeros(dimensions, dtype=float)
    for token in _tokenize(text):
        index = hash(token) % dimensions
        sign = 1.0 if hash(token + "::sign") % 2 == 0 else -1.0
        vector[index] += sign
    norm = math.sqrt(float(np.dot(vector, vector)))
    if norm == 0:
        return vector.tolist()
    return (vector / norm).tolist()


@lru_cache
def _load_sentence_transformer(model_name: str):
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        return None
    return SentenceTransformer(model_name)


def embed_texts(texts: list[str], model_name: str) -> list[list[float]]:
    try:
        from app.config import get_settings
        settings = get_settings()
        if settings.hf_token:
            import httpx
            api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model_name}"
            headers = {"Authorization": f"Bearer {settings.hf_token}"}
            response = httpx.post(api_url, headers=headers, json={"inputs": texts}, timeout=30)
            if response.status_code == 200:
                return response.json()
    except Exception:
        pass

    try:
        model = _load_sentence_transformer(model_name)
        if model is not None:
            return model.encode(texts, normalize_embeddings=True).tolist()
    except Exception:
        pass

    return [_hash_embed(text) for text in texts]
