from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import verify_api_key
from app.rate_limit import RateLimitMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers.chat import router as chat_router
from app.routers.files import router as files_router


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "AI-powered question answering across PDFs, audio, and video. "
        "Use the built-in OpenAPI docs at /docs for interactive API exploration."
    ),
    openapi_tags=[
        {"name": "files", "description": "Upload, inspect, and reprocess source files."},
        {"name": "chat", "description": "Ask grounded questions and fetch recent chat history."},
    ],
)

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Depends
app.include_router(files_router, prefix=settings.api_prefix, dependencies=[Depends(verify_api_key)])
app.include_router(chat_router, prefix=settings.api_prefix, dependencies=[Depends(verify_api_key)])
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.on_event("startup")
def on_startup() -> None:
    init_db(settings)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
