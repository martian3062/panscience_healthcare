import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "MediaMind"
    api_prefix: str = "/api"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    sqlite_path: str = "./data/app.db"
    chroma_path: str = "./data/chroma"
    upload_dir: str = "./uploads"

    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_chat_model: str = "llama-3.3-70b-versatile"
    groq_transcription_model: str = "whisper-large-v3-turbo"

    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_chat_model: str = "llama3.2"

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    max_chunk_chars: int = 900
    chunk_overlap_chars: int = 140
    max_query_chunks: int = 6
    upload_size_limit_mb: int = 200
    allow_dev_text_uploads: bool = True

    valid_api_keys: str = ""
    rate_limit_per_minute: int = 30

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return json.loads(stripped)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    def ensure_dirs(self) -> None:
        Path(self.sqlite_path).resolve().parent.mkdir(parents=True, exist_ok=True)
        Path(self.chroma_path).resolve().mkdir(parents=True, exist_ok=True)
        Path(self.upload_dir).resolve().mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
