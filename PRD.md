# Product Requirements Document (PRD): MediaMind Platform

## 1. Executive Summary
MediaMind is an advanced, AI-powered multilingual document and multimedia Intelligence Q&A platform. It empowers users to seamlessly ingest massive unformatted media artifacts—including PDFs, Video, Audio recordings, and plain text files—and interact with them through an incredibly fast Retrieval-Augmented Generation (RAG) chat copilot. 

Designed for scalability and user experience, it features dynamic audio playback synchronization, deep vector-embedded semantic search, and an automated deployment pipeline onto AWS cloud architecture using Docker.

## 2. Technical Goals & Objectives
The goal is to provide a production-grade infrastructure that surpasses basic QA tools:
- **Universal Media Support:** Ingest dense PDFs, video lectures (mp4), and audio podcasts (mp3, wav).
- **Advanced Neural TTS & Dictation:** Browser-based human-like Text-To-Speech (TTS) reading interfaces with "Karaoke" style word-level subtitle tracking, alongside Web Speech API dictation inputs.
- **Timestamped Citations:** For multimedia files, the AI Chatbot natively surfaces video/audio timestamps as citations and allows one-click jumping to the exact playback moment.
- **Robust Pipeline Orchestrator:** FastAPI-managed background processing, dynamic file conversion constraints (FFMPEG auto-downsampling on ultra-large payloads), and optimized chunking pipelines avoiding out-of-memory cloud scenarios.

## 3. Key Features & Requirements

### 3.1. Frontend Platform (Next.js & React)
- **Voice UI Copilot:** Embedded microphone buttons allowing voice-to-text queries via `webkitSpeechRecognition`. 
- **Accessible Subtitling:** A visual "TV-style" lower display placeholder tracking the generated TTS responses in real-time, syncing the spoken frame perfectly.
- **Analytics Subsystem:** Real-time data visualization showing indexed chunks across media types, success/failure statuses, and memory ingestion sizes via Recharts.
- **OLED UI Architecture:** High contrast, deep black themes suitable for advanced clinical, corporate, or nighttime usage profiles.

### 3.2. Backend Pipeline (FastAPI, Groq, ChromaDB)
- **Orchestrated Ingestion:** Native API pipelines parsing Python-Docx, PyMuPDF, and Whisper models.
- **Large Payload Safety Protocol:** 500 MB reverse proxy gates with automated `FFMPEG` pre-compression hooks to squeeze giant video/audio files into `32k` mp3 endpoints effortlessly mitigating standard LLM 400 limitations.
- **High-Agility Fallback AI:** Utilizing Groq specifically chained across fallback pipelines (`whisper-large-v3-turbo` -> `distil-whisper-large-v3-en`) ensuring no single-point-of-failure in speech detection.

## 4. Architecture Stack
- **Frontend Layer:** Next.js (TypeScript), Tailwind CSS, Lucide Icons, Recharts, Web Speech API natively on-client.
- **Backend Services:** FastAPI, PyTest (>98% coverage), SQLModel, Python 3.11, Whisper/Groq wrappers, ChromaDB, Sentence-Transformers.
- **Infrastructure:** Docker Compose multi-container stack natively mapping onto `Ubuntu EC2` on AWS behind an `Nginx` load-balancing gateway configuration.

## 5. Live Environment & Tracking
- **Production Server:** Live at `http://13.51.249.81`
- **Codebase Source:** Hosted continuously on GitHub `https://github.com/martian3062/panscience_healthcare`
- **Verification Gate:** Integrated automated unit enforcement blocking pushes under `95%` line coverage.
