# MediaMind Assignment

MediaMind is an AI-powered document and multimedia Q&A web application for PDFs, audio, and video. Users can upload files, review extracted summaries, ask grounded questions, inspect timestamps, and jump directly to the relevant playback moment from the chatbot response.

## Assignment status

This repository now covers the core assignment requirements:

- Upload PDFs, audio, and video
- Summarize uploaded content
- Ask questions against uploaded files
- Extract and display audio/video timestamps
- Jump the native media player to the cited timestamp
- Containerize with Docker and run both services with Docker Compose
- Run automated backend tests with a 95%+ enforced coverage gate
- Build and validate in GitHub Actions

Current backend coverage gate: **95% minimum required, 98%+ currently passing locally**

Manual submission items still needed outside the codebase:

- Live demo URL
- Walkthrough video link

## Tech choices kept minimal

The implementation stays close to built-in framework capabilities where possible:

- FastAPI built-in OpenAPI docs for API documentation
- FastAPI `BackgroundTasks` for ingestion jobs
- Native HTML5 audio/video seeking for timestamp playback
- SQLite for metadata persistence
- Chroma-ready vector retrieval adapter with optional install
- Only one small extra test dependency added for coverage enforcement: `pytest-cov`

## Features

- Upload PDF, audio, video, and optional dev text files
- Background ingestion pipeline
- PDF text extraction
- Audio/video transcription with timestamped segments
- Chunking and retrieval
- Citation-backed chatbot answers
- Source summaries
- Native media playback with jump-to-time support
- Responsive frontend with animated visualization

## Project structure

- `frontend/` - Next.js application
- `backend/` - FastAPI service
- `scripts/` - root helper scripts
- `.github/workflows/ci.yml` - CI plus container publish workflow
- `docker-compose.yml` - multi-container local orchestration

## Local setup

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Optional AI extras:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-ai.txt
```

### 2. Frontend

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open:

- Frontend: `http://127.0.0.1:3000`
- Backend docs: `http://127.0.0.1:8000/docs`
- Backend OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Root commands

From the repository root:

```powershell
npm run check
```

Runs:

- backend pytest with coverage gate
- frontend typecheck
- frontend production build

```powershell
npm run dev:all
```

Starts both frontend and backend together.

## Environment files

### `backend/.env`

```env
APP_NAME=MediaMind
API_PREFIX=/api
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
SQLITE_PATH=./data/app.db
CHROMA_PATH=./data/chroma
UPLOAD_DIR=./uploads
GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_CHAT_MODEL=llama3.2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
MAX_CHUNK_CHARS=900
CHUNK_OVERLAP_CHARS=140
MAX_QUERY_CHUNKS=6
UPLOAD_SIZE_LIMIT_MB=200
ALLOW_DEV_TEXT_UPLOADS=true
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## API documentation

FastAPI serves interactive documentation out of the box:

- Swagger UI: `/docs`
- OpenAPI schema: `/openapi.json`

### Main endpoints

#### Files

- `GET /api/files`
  - List uploaded files and ingestion status
- `POST /api/files/upload`
  - Upload a PDF, audio, video, or allowed dev text file
- `GET /api/files/{file_id}`
  - Fetch file details, summary, and chunk previews
- `POST /api/files/{file_id}/reingest`
  - Re-run ingestion for an existing file

#### Chat

- `POST /api/chat/query`
  - Ask a grounded question using selected files
  - Returns answer text, citations, scores, and timestamps when available
- `GET /api/chat/history`
  - List recent chat questions and answers

#### Health

- `GET /health`
  - Simple service health check

## Testing and coverage

### Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

The backend test suite enforces:

- `--cov=app`
- terminal missing-lines report
- XML report output to `backend/coverage.xml`
- `--cov-fail-under=95`

### Frontend

```powershell
cd frontend
npm run typecheck
npx playwright test
```

## Docker

### Individual Dockerfiles

- [backend/Dockerfile](/E:/assignment/backend/Dockerfile)
- [frontend/Dockerfile](/E:/assignment/frontend/Dockerfile)

### Compose

```powershell
docker compose up --build
```

This starts:

- backend on `8000`
- frontend on `3000`

## CI/CD

GitHub Actions workflow: [.github/workflows/ci.yml](/E:/assignment/.github/workflows/ci.yml)

What it does:

- installs backend dependencies
- runs backend tests with coverage gate
- uploads backend coverage XML as an artifact
- installs frontend dependencies
- builds the frontend
- on pushes to `main`, publishes backend and frontend container images to `ghcr.io`

## Notes for reviewers

- Groq can be used as the primary hosted model when `GROQ_API_KEY` is present.
- Ollama is the local fallback for chat.
- `requirements-ai.txt` keeps heavier AI dependencies optional for faster first-time setup.
- The repo is ready for a live deployment step, but the actual public deployment URL and recorded walkthrough still need to be produced for final submission.

## Submission checklist

- [x] Source code
- [x] README with setup, testing, API documentation, and running instructions
- [x] Automated coverage gate at 95%+
- [x] Dockerfiles
- [x] Docker Compose
- [x] GitHub Actions workflow
- [ ] Live demo URL
- [ ] Walkthrough video link

# panscience_healthcare
