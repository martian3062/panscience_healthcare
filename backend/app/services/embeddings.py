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
    model = _load_sentence_transformer(model_name)
    if model is None:
        return [_hash_embed(text) for text in texts]
    embeddings = model.encode(texts, normalize_embeddings=True)
    return embeddings.tolist()
