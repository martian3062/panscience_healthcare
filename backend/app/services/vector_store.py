from __future__ import annotations

from typing import Any

from app.config import Settings


class VectorStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = None
        try:
            import chromadb

            self.client = chromadb.PersistentClient(path=settings.chroma_path)
        except ImportError:
            self.client = None

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _collection(self):
        if self.client is None:
            return None
        return self.client.get_or_create_collection(name="assignment_chunks")

    def replace_file_chunks(self, file_id: str, chunks: list[dict], embeddings: list[list[float]]) -> bool:
        collection = self._collection()
        if collection is None:
            return False

        try:
            collection.delete(where={"file_id": file_id})
        except Exception:
            pass

        collection.add(
            ids=[chunk["id"] for chunk in chunks],
            embeddings=embeddings,
            documents=[chunk["text"] for chunk in chunks],
            metadatas=[
                {
                    "file_id": file_id,
                    "page_number": chunk.get("page_number"),
                    "timestamp_start": chunk.get("timestamp_start"),
                    "timestamp_end": chunk.get("timestamp_end"),
                }
                for chunk in chunks
            ],
        )
        return True

    def delete_file(self, file_id: str) -> bool:
        collection = self._collection()
        if collection is None:
            return False
        try:
            collection.delete(where={"file_id": file_id})
        except Exception:
            pass
        return True

    def query(self, query_embedding: list[float], limit: int, file_ids: list[str]) -> list[dict[str, Any]]:
        collection = self._collection()
        if collection is None:
            return []

        if file_ids:
            where: dict[str, Any] | None = {"file_id": file_ids[0]} if len(file_ids) == 1 else {"file_id": {"$in": file_ids}}
        else:
            where = None

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=where,
            include=["metadatas", "distances", "documents"],
        )

        ids = results.get("ids", [[]])[0]
        distances = results.get("distances", [[]])[0]
        items: list[dict[str, Any]] = []
        for index, chunk_id in enumerate(ids):
            distance = distances[index] if index < len(distances) else 1.0
            items.append({"id": chunk_id, "score": round(max(0.0, 1.0 - float(distance)), 4)})
        return items
