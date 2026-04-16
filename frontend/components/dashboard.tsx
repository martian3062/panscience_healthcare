"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Database,
  FileText,
  FlaskConical,
  LoaderCircle,
  MessageSquare,
  Mic2,
  RefreshCw,
  Search,
  Play,
  Pause,
  Square,
  Sun,
  Moon,
  Sparkles,
  Trash2,
  UploadCloud,
  Volume2,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import { FluidScene } from "@/components/fluid-scene";
import { MissionBackground } from "@/components/mission-background";
import { PipelineChart } from "@/components/pipeline-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { missionGradeVars, sampleMissionGrade, type PointerState } from "@/lib/mission-grade";
import {
  API_BASE_URL,
  assetUrl,
  type ChatHistoryItem,
  type ChatResponse,
  type Citation,
  type FileDetail,
  type FileRecord,
  getChatHistory,
  getFile,
  listFiles,
  streamChatQuery,
  uploadFile,
  deleteFile
} from "@/lib/api";

const solutionCards = [
  {
    id: "pdf-insights",
    title: "Document intelligence",
    text: "Anchor every answer to the exact page, extracted passage, and source file.",
    icon: FileText,
  },
  {
    id: "audio-moments",
    title: "Audio moments",
    text: "Transcribe long recordings and jump to the exact second where a topic appears.",
    icon: Mic2,
  },
  {
    id: "video-evidence",
    title: "Video evidence",
    text: "Surface answer-backed timestamps so teams can verify context without scrubbing.",
    icon: Clapperboard,
  },
] as const;

const processSteps = [
  {
    title: "Upload & catalogue",
    text: "Capture PDFs, recordings, and video while storing metadata, summaries, and processing status.",
  },
  {
    title: "Extract & transcribe",
    text: "Turn pages into structured text and speech into timestamped transcript segments.",
  },
  {
    title: "Retrieve & answer",
    text: "Blend semantic retrieval and grounded generation so every answer points back to the source.",
  },
] as const;

function formatTime(seconds: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return "00:00";
  const total = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${mins}:${secs}`;
  }
  return `${mins}:${secs}`;
}

function statusTone(status: FileRecord["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  if (status === "processing") return "warning";
  return "neutral";
}

function mediaLabel(mediaType: FileRecord["media_type"]) {
  if (mediaType === "pdf") return "PDF";
  if (mediaType === "audio") return "Audio";
  if (mediaType === "video") return "Video";
  return "Text";
}

export function Dashboard() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<FileDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSeek, setPendingSeek] = useState<{ fileId: string; seconds: number } | null>(null);
  const [pointer, setPointer] = useState<PointerState>({ x: 0, y: 0 });
  const pointerRef = useRef<PointerState>({ x: 0, y: 0 });
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [isDark]);

  const [ttsState, setTtsState] = useState<"playing" | "paused" | "stopped">("stopped");
  const [ttsProgress, setTtsProgress] = useState(0);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [ttsActiveCharIndex, setTtsActiveCharIndex] = useState(-1);
  const ttsBoundariesRef = useRef<{ id: string; start: number; end: number }[]>([]);
  const ttsPayloadRef = useRef<{ text: string; type: "text" | "document" }>({ text: "", type: "text" });
  const ttsStartIndexRef = useRef<number>(0);

  const selectedFile = useMemo(
    () => files.find((item) => item.id === selectedFileId) ?? null,
    [files, selectedFileId]
  );

  const readyCount = files.filter((file) => file.status === "ready").length;
  const processingCount = files.filter(
    (file) => file.status === "processing" || file.status === "uploaded"
  ).length;
  const sourceCount = selectedFileIds.length || files.length;

  async function refreshFiles(preserveSelection = true) {
    try {
      const nextFiles = await listFiles();
      setFiles(nextFiles);
      if (!preserveSelection && nextFiles[0]) {
        setSelectedFileId(nextFiles[0].id);
      }
      if (!selectedFileId && nextFiles[0]) {
        setSelectedFileId(nextFiles[0].id);
      }
      setSelectedFileIds((current) =>
        current.filter((fileId) => nextFiles.some((file) => file.id === fileId))
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to load files.");
    }
  }

  async function refreshHistory() {
    try {
      setChatHistory(await getChatHistory());
    } catch {
      // Secondary panel can remain quiet when history is unavailable.
    }
  }

  useEffect(() => {
    void refreshFiles(false);
    void refreshHistory();
  }, []);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    let frameId = 0;
    let lastPaint = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      if (now - lastPaint >= 33) {
        const grade = sampleMissionGrade((now - startedAt) / 1000, pointerRef.current, isDark);
        const nextVars = missionGradeVars(grade);

        for (const [name, value] of Object.entries(nextVars)) {
          rootStyle.setProperty(name, value);
        }

        lastPaint = now;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (!rootRef.current) return;

    const ctx = gsap.context(() => {
      const heroTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      heroTimeline
        .from(".js-nav", { y: -16, opacity: 0, duration: 0.7 })
        .from(".js-hero-copy > *", { y: 28, opacity: 0, stagger: 0.11, duration: 0.8 }, "-=0.4")
        .from(".js-hero-visual", { x: 34, opacity: 0, duration: 0.9 }, "-=0.6")
        .from(".js-stat-card", { y: 24, opacity: 0, stagger: 0.08, duration: 0.55 }, "-=0.45");

      gsap.to(".hero-floating-card", {
        y: -10,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.utils.toArray<HTMLElement>(".js-reveal").forEach((element) => {
        gsap.from(element, {
          y: 34,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: element,
            start: "top 84%",
            once: true,
          },
        });
      });

      gsap.utils.toArray<HTMLElement>(".js-stagger-group").forEach((group) => {
        const items = group.querySelectorAll(".js-stagger-item");
        gsap.from(items, {
          y: 22,
          opacity: 0,
          duration: 0.56,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: {
            trigger: group,
            start: "top 84%",
            once: true,
          },
        });
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!selectedFileId) {
      setActiveFile(null);
      return;
    }

    let cancelled = false;
    getFile(selectedFileId)
      .then((detail) => {
        if (!cancelled) {
          setActiveFile(detail);
        }
      })
      .catch((detailError) => {
        if (!cancelled) {
          setError(detailError instanceof Error ? detailError.message : "Unable to load file detail.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFileId]);

  useEffect(() => {
    const hasPending = files.some((file) => file.status === "uploaded" || file.status === "processing");
    if (!hasPending) return;

    const interval = window.setInterval(() => {
      void refreshFiles();
      if (selectedFileId) {
        void getFile(selectedFileId).then(setActiveFile).catch(() => undefined);
      }
    }, 3500);

    return () => window.clearInterval(interval);
  }, [files, selectedFileId]);

  useEffect(() => {
    if (!pendingSeek || activeFile?.id !== pendingSeek.fileId || !mediaRef.current) return;
    mediaRef.current.currentTime = pendingSeek.seconds;
    void mediaRef.current.play().catch(() => undefined);
    setPendingSeek(null);
  }, [activeFile, pendingSeek]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      setFiles((current) => [uploaded, ...current]);
      setSelectedFileId(uploaded.id);
      setSelectedFileIds((current) => (current.includes(uploaded.id) ? current : [uploaded.id, ...current]));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleAsk() {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setStreamingAnswer("");
    setChatResult(null);

    try {
      let accumulated = "";
      await streamChatQuery(
        { question, file_ids: selectedFileIds },
        (text) => {
          accumulated += text;
          setStreamingAnswer(accumulated);
        },
        (result) => {
          result.answer = accumulated;
          setChatResult(result);
          setStreamingAnswer("");
          void refreshHistory();
          setBusy(false);
          setQuestion("");
        },
        (err) => {
          setError(err.message);
          setBusy(false);
        }
      );
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Query failed.");
      setBusy(false);
    }
  }

  function playFromOffset(offset: number) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    const fullText = ttsPayloadRef.current.text;
    const remainingText = fullText.substring(offset);
    
    ttsStartIndexRef.current = offset;
    
    const utterance = new SpeechSynthesisUtterance(remainingText);
    const totalLen = fullText.length;
    
    utterance.onstart = () => {
      setTtsState("playing");
      setTtsProgress((offset / (totalLen || 1)) * 100);
      setTtsActiveCharIndex(offset);
    };
    
    utterance.onboundary = (event) => {
      const absoluteCharIdx = ttsStartIndexRef.current + event.charIndex;
      setTtsProgress((absoluteCharIdx / (totalLen || 1)) * 100);
      setTtsActiveCharIndex(absoluteCharIdx);
      
      if (ttsPayloadRef.current.type === "document") {
        const match = ttsBoundariesRef.current.find(b => absoluteCharIdx >= b.start && absoluteCharIdx <= b.end);
        if (match) {
          if (activeChunkId !== match.id) {
            setActiveChunkId(match.id);
            const el = document.getElementById(`chunk-${match.id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    };
    
    const handleStop = () => {
      setTtsState("stopped");
      setTtsProgress(0);
      setActiveChunkId(null);
      setTtsActiveCharIndex(-1);
    };
    
    utterance.onend = handleStop;
    utterance.onerror = handleStop;
    
    window.speechSynthesis.speak(utterance);
  }

  function speakText(e: MouseEvent, text: string) {
    e.stopPropagation();
    ttsBoundariesRef.current = [];
    setActiveChunkId(null);
    ttsPayloadRef.current = { text, type: "text" };
    playFromOffset(0);
  }

  function speakDocument(e: MouseEvent) {
    e.preventDefault();
    if (!activeFile || activeFile.chunks.length === 0) return;
    
    let fullText = "";
    const boundaries: { id: string; start: number; end: number }[] = [];
    
    activeFile.chunks.forEach((chunk) => {
      const start = fullText.length;
      fullText += chunk.text + ". ";
      const end = fullText.length;
      boundaries.push({ id: chunk.id, start, end });
    });
    
    ttsBoundariesRef.current = boundaries;
    ttsPayloadRef.current = { text: fullText, type: "document" };
    playFromOffset(0);
  }

  function handleSliderSeek(e: ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    const totalLen = ttsPayloadRef.current.text.length;
    if (totalLen > 0) {
      const targetOffset = Math.floor((val / 100) * totalLen);
      playFromOffset(targetOffset);
    }
  }

  async function handleDeleteFile() {
    if (!activeFile) return;
    if (!confirm("Are you sure you want to completely delete this file? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteFile(activeFile.id);
      setActiveFile(null);
      setSelectedFileId("");
      await loadFiles();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleCitationClick(citation: Citation) {
    setSelectedFileId(citation.file_id);
    if (citation.timestamp_start != null) {
      setPendingSeek({ fileId: citation.file_id, seconds: citation.timestamp_start });
    }
  }

  function handlePointerMove(event: MouseEvent<HTMLDivElement>) {
    const nextX = (event.clientX / window.innerWidth) * 2 - 1;
    const nextY = -((event.clientY / window.innerHeight) * 2 - 1);
    const nextPointer = { x: nextX, y: nextY };
    pointerRef.current = nextPointer;
    setPointer(nextPointer);
  }

  function toggleFileScope(fileId: string) {
    setSelectedFileIds((current) =>
      current.includes(fileId) ? current.filter((value) => value !== fileId) : [...current, fileId]
    );
  }

  function renderChunkText(chunk: { id: string, text: string }) {
    if (activeChunkId === chunk.id && ttsActiveCharIndex !== -1) {
      const match = ttsBoundariesRef.current.find(b => b.id === chunk.id);
      if (match) {
        const localIdx = ttsActiveCharIndex - match.start;
        if (localIdx >= 0 && localIdx < chunk.text.length) {
          const nextSpace = chunk.text.indexOf(" ", localIdx);
          const endIdx = nextSpace === -1 ? chunk.text.length : nextSpace;
          const before = chunk.text.substring(0, localIdx);
          const activeWord = chunk.text.substring(localIdx, endIdx);
          const after = chunk.text.substring(endIdx);
          return (
            <p className="whitespace-pre-wrap">
              {before}<mark className="bg-amber-300 text-amber-900 rounded-sm px-0.5">{activeWord}</mark>{after}
            </p>
          );
        }
      }
    }
    return <p className="whitespace-pre-wrap">{chunk.text}</p>;
  }

  return (
    <div ref={rootRef} className="site-shell" onMouseMove={handlePointerMove}>
      <style>{`
        @keyframes glimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
      <MissionBackground pointer={pointer} isDark={isDark} />

      <header className="site-topbar">
        <div className="site-container">
          <div className="site-nav js-nav">
            <Link href="/" className="brand-mark" aria-label="MediaMind home">
              <span className="brand-mark-badge">M</span>
              <span className="brand-mark-text">MediaMind</span>
            </Link>

            <nav className="top-links" aria-label="Primary">
              <a href="#solutions">Solutions</a>
              <a href="#workspace">Workspace</a>
              <a href="#process">Process</a>
              <a href="#conversation">Conversation</a>
            </nav>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsDark(!isDark)} 
                className="p-2 text-gray-500 hover:text-accent outline-none transition-colors" 
                aria-label="Toggle dark mode"
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <label className="site-cta">
                <span>{uploading ? "Uploading..." : "Upload Source"}</span>
                <input
                  className="hidden"
                  type="file"
                  accept=".pdf,.mp3,.wav,.m4a,.mp4,.mov,.mkv,.webm,.txt,.md,.doc,.docx"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="site-container hero-grid">
            <aside className="hero-rail" aria-label="Section links">
              <a href="#intro">Introduction</a>
              <a href="#solutions">Our Solutions</a>
              <a href="#workspace">Our Platform</a>
              <a href="#conversation">Latest Answers</a>
              <a href="#process">Process</a>
            </aside>

            <div className="hero-copy js-hero-copy" id="intro">
              <p className="eyebrow">Powered by FastAPI, Chroma-ready retrieval, and grounded AI workflows</p>
              <h1>Precision answers across every source, page, and moment.</h1>
              <p className="hero-text">
                We turn PDFs, audio, and video into structured, searchable evidence so teams can move from question to
                verified source context with confidence.
              </p>

              <div className="hero-actions flex flex-wrap items-center gap-4">
                <Button onClick={() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" })}>
                  Open Workspace
                </Button>
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("solutions")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Explore Capabilities
                </Button>

                <label 
                  className="cursor-pointer inline-flex items-center justify-center px-6 py-2.5 font-semibold text-white rounded-md transition-all shadow-[0_0_20px_rgba(32,145,208,0.4)] hover:shadow-[0_0_30px_rgba(32,145,208,0.6)] hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(90deg, #1e3a8a, #3b82f6, #1e3a8a, #3b82f6)",
                    backgroundSize: "300% 100%",
                    animation: "glimmer 3s infinite linear",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <UploadCloud className="h-5 w-5" />
                    <span>{uploading ? "Uploading..." : "Upload New Source"}</span>
                  </div>
                  <input
                    className="hidden"
                    type="file"
                    accept=".pdf,.mp3,.wav,.m4a,.mp4,.mov,.mkv,.webm,.txt,.md,.doc,.docx"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </label>
              </div>

              <p className="hero-subline">
                AI-powered retrieval | Timestamp jumps | Citation-backed responses
              </p>
            </div>

            <div className="hero-visual js-hero-visual">
              <div className="hero-visual-inner">
                <FluidScene pointer={pointer} />
                <div className="hero-soft-glow" />
                <div className="hero-floating-card">
                  <p className="hero-floating-label">Latest ingest</p>
                  <p className="hero-floating-title">
                    {selectedFile?.filename || "Waiting for the next source file"}
                  </p>
                  <div className="hero-floating-meta">
                    <span>{readyCount} ready</span>
                    <span>{processingCount} processing</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="stat-section">
          <div className="site-container">
            <div className="stat-grid">
              <div className="stat-card js-stat-card">
                <Database className="mission-accent-icon h-4 w-4" />
                <div>
                  <strong>{readyCount}</strong>
                  <span>Indexed sources</span>
                </div>
              </div>
              <div className="stat-card js-stat-card">
                <Building2 className="mission-accent-icon h-4 w-4" />
                <div>
                  <strong>{sourceCount}</strong>
                  <span>Active search scope</span>
                </div>
              </div>
              <div className="stat-card js-stat-card">
                <FlaskConical className="mission-accent-icon h-4 w-4" />
                <div>
                  <strong>{chatHistory.length}</strong>
                  <span>Recent grounded answers</span>
                </div>
              </div>
              <div className="stat-card js-stat-card">
                <CheckCircle2 className="mission-accent-icon h-4 w-4" />
                <div>
                  <strong>{processingCount}</strong>
                  <span>Sources in processing</span>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="section-block workspace-shell js-reveal" id="workspace">
          <div className="site-container">
            <div className="section-heading compact">
              <span className="section-kicker">Product workspace</span>
              <h2>Review source content, then ask directly against the files in scope.</h2>
              <p>
                The interface keeps uploads, page-level context, transcript snippets, media playback, and answer
                citations on one screen.
              </p>
            </div>

            <div className="workspace-grid">
              <section className="surface-panel js-reveal">
                <div className="surface-head">
                  <div>
                    <p className="surface-kicker">Library</p>
                    <h3>{files.length} source files</h3>
                  </div>
                  <Button variant="ghost" className="h-9 px-3" onClick={() => void refreshFiles()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <div className="surface-scroll">
                  {files.length === 0 ? (
                    <div className="empty-copy">
                      <p>Upload the first source to begin indexing.</p>
                      <p>PDFs, recordings, videos, and text files are supported.</p>
                    </div>
                  ) : (
                    files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => setSelectedFileId(file.id)}
                        className={`file-row ${selectedFileId === file.id ? "file-row-active" : ""}`}
                      >
                        <div className="file-row-top">
                          <div>
                            <p className="file-name">{file.filename}</p>
                            <p className="file-meta">
                              {mediaLabel(file.media_type)} | {new Date(file.uploaded_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge tone={statusTone(file.status)}>{file.status}</Badge>
                        </div>
                        <p className="file-summary">
                          {file.summary || file.error || "Indexing content and preparing source links."}
                        </p>
                        <label
                          className="file-scope-toggle"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFileIds.includes(file.id)}
                            onChange={() => toggleFileScope(file.id)}
                          />
                          Ask over this file
                        </label>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="surface-panel js-reveal">
                <div className="surface-head">
                  <div>
                    <p className="surface-kicker">Source review</p>
                    <h3>{selectedFile ? selectedFile.filename : "Choose a source file"}</h3>
                  </div>
                </div>

                {!selectedFile || !activeFile ? (
                  <div className="surface-empty">
                    <p className="surface-empty-title">Source context stays available while you ask.</p>
                    <p>
                      Open any indexed file to review its summary, inspect extracted chunks, and jump back to the
                      original media or document.
                    </p>
                  </div>
                ) : (
                  <div className="surface-body">
                    <div className="source-badges flex-wrap flex gap-2">
                      <Badge>{mediaLabel(selectedFile.media_type)}</Badge>
                      <Badge tone={statusTone(selectedFile.status)}>{selectedFile.status}</Badge>
                      {selectedFile.page_count ? <Badge>{selectedFile.page_count} pages</Badge> : null}
                      {selectedFile.duration_seconds ? <Badge>{formatTime(selectedFile.duration_seconds)}</Badge> : null}
                      
                      <div className="flex-1" />
                      <button onClick={handleDeleteFile} className="text-sm font-medium text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors">
                        <Trash2 className="h-4 w-4" />
                        Delete File
                      </button>
                    </div>

                    <div className="summary-panel">
                      <div className="summary-head">
                        <Sparkles className="mission-accent-icon h-4 w-4" />
                        <span>Summary</span>
                      </div>
                      <p>{activeFile.summary || activeFile.error || "This source is still processing."}</p>
                    </div>

                    {selectedFile.media_type === "audio" ? (
                      <audio
                        ref={(node) => {
                          mediaRef.current = node;
                        }}
                        controls
                        className="media-player"
                        src={assetUrl(activeFile.media_url)}
                      />
                    ) : null}

                    {selectedFile.media_type === "video" ? (
                      <video
                        ref={(node) => {
                          mediaRef.current = node;
                        }}
                        controls
                        className="video-player"
                        src={assetUrl(activeFile.media_url)}
                      />
                    ) : null}

                    {selectedFile.media_type === "pdf" || selectedFile.media_type === "text" || selectedFile.media_type === "docx" ? (
                      <div className="flex items-center gap-4 py-4">
                        <a
                          className="inline-link m-0"
                          href={assetUrl(activeFile.media_url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open original file
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                        <button onClick={speakDocument} className="text-sm font-medium text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors">
                          <Volume2 className="h-4 w-4" />
                          Read Document Aloud
                        </button>
                      </div>
                    ) : null}

                    <div className="chunk-panel">
                      <div className="chunk-panel-head">
                        <span>Indexed chunks</span>
                        <small>{activeFile.chunk_count} items</small>
                      </div>
                      <div className="chunk-list">
                        {activeFile.chunks.length === 0 ? (
                          <p className="chunk-empty">No chunks are available yet.</p>
                        ) : (
                          activeFile.chunks.map((chunk) => (
                            <div 
                              id={`chunk-${chunk.id}`}
                              key={chunk.id} 
                              className={`chunk-row transition-all duration-300 ${activeChunkId === chunk.id ? "bg-amber-50 dark:bg-amber-900/20 border-l-4 border-l-amber-400 shadow-sm transform scale-[1.02]" : ""}`}
                            >
                              <div className="chunk-meta">
                                <span>#{chunk.order_index + 1}</span>
                                {chunk.page_number != null ? <span>Page {chunk.page_number}</span> : null}
                                {chunk.timestamp_start != null ? (
                                  <span>
                                    {formatTime(chunk.timestamp_start)}-{formatTime(chunk.timestamp_end)}
                                  </span>
                                ) : null}
                              </div>
                              {renderChunkText(chunk)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="surface-panel js-reveal" id="conversation">
                <div className="surface-head">
                  <div>
                    <p className="surface-kicker">Conversation</p>
                    <h3>Ask for a fact, topic, or exact moment.</h3>
                  </div>
                </div>

                <div className="surface-body conversation-body">
                  <div className="scope-line">
                    {selectedFileIds.length === 0 ? (
                      <span>All indexed files are currently included in search scope.</span>
                    ) : (
                      selectedFileIds.map((fileId) => {
                        const file = files.find((item) => item.id === fileId);
                        return file ? <Badge key={fileId}>{file.filename}</Badge> : null;
                      })
                    )}
                  </div>

                  <Textarea
                    placeholder="Ask where a topic appears, what a report concludes, or when a meeting commits to an action."
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                  />

                  <Button onClick={() => void handleAsk()} disabled={busy || !question.trim()}>
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {busy ? "Searching..." : "Ask question"}
                  </Button>

                  <div className="answer-panel">
                    <div className="answer-head">
                      <Bot className="mission-accent-icon h-4 w-4" />
                      <span>Latest answer</span>
                    </div>

                    {chatResult ? (
                      <div className="answer-body">
                        <div className="answer-meta">
                          <Badge tone="success">{chatResult.provider}</Badge>
                          <Badge>{new Date(chatResult.created_at).toLocaleTimeString()}</Badge>
                          <button onClick={(e) => speakText(e, chatResult.answer)} className="text-sm font-medium text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors">
                            <Volume2 className="h-4 w-4" />
                            Read Aloud
                          </button>
                        </div>
                        <p className="answer-copy">{chatResult.answer}</p>

                        <div className="citation-list">
                          {chatResult.citations.map((citation) => (
                            <button
                              key={citation.chunk_id}
                              type="button"
                              onClick={() => handleCitationClick(citation)}
                              className="citation-row"
                            >
                              <div className="citation-meta">
                                <span>{citation.file_name}</span>
                                {citation.page_number != null ? <span>Page {citation.page_number}</span> : null}
                                {citation.timestamp_start != null ? (
                                  <span>
                                    {formatTime(citation.timestamp_start)}-{formatTime(citation.timestamp_end)}
                                  </span>
                                ) : null}
                              </div>
                              <p>{citation.excerpt}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : streamingAnswer ? (
                      <div className="answer-body">
                        <div className="answer-meta">
                          <Badge tone="warning">streaming</Badge>
                        </div>
                        <p className="answer-copy">{streamingAnswer}</p>
                      </div>
                    ) : (
                      <p className="answer-placeholder">
                        Answers appear here with page references or jump-ready timestamps once you run a query.
                      </p>
                    )}
                  </div>

                  <div className="history-panel">
                    <div className="answer-head">
                      <MessageSquare className="mission-accent-icon h-4 w-4" />
                      <span>Recent questions</span>
                    </div>
                    <div className="history-list">
                      {chatHistory.length === 0 ? (
                        <p className="answer-placeholder">Recent questions show up here after the first query.</p>
                      ) : (
                        chatHistory.map((item) => (
                          <div key={item.id} className="history-row">
                            <div className="history-row-top">
                              <p>{item.question}</p>
                              <Badge>{item.provider}</Badge>
                            </div>
                            <span>{item.answer}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="section-block process-shell js-reveal" id="process">
          <div className="site-container">
            <div className="process-grid">
              <div className="section-heading compact">
                <span className="section-kicker">Recommended flow</span>
                <h2>From raw media to precise, source-backed answers.</h2>
                <p>
                  The platform keeps structured metadata in SQLite, semantic search in Chroma-ready storage, and
                  answer generation behind a hosted-to-local fallback chain.
                </p>
                <div className="process-api">
                  <Database className="mission-accent-icon h-4 w-4" />
                  <span>{API_BASE_URL}</span>
                </div>
              </div>

              <div className="process-steps js-stagger-group">
                {processSteps.map((step, index) => (
                  <article key={step.title} className="process-step js-stagger-item">
                    <span className="process-index">0{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <PipelineChart files={files} chatHistory={chatHistory} selectedFileIds={selectedFileIds} />
          </div>
        </section>

        <section className="section-block js-reveal" id="solutions" style={{ borderTop: "1px solid var(--mission-panel-border)", backgroundColor: "var(--mission-panel-soft)" }}>
          <div className="site-container">
            <div className="section-heading" style={{ maxWidth: "600px", margin: "0 auto 40px", textAlign: "center" }}>
              <span className="section-kicker">Core capabilities</span>
              <h2 style={{ fontSize: "24px" }}>Built for mixed media retrieval, not just keyword search.</h2>
              <p>
                Search across long reports, calls, and lectures with page citations, transcript evidence, and
                timestamp navigation baked into the product surface.
              </p>
            </div>

            <div className="solution-grid js-stagger-group" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
              {solutionCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article 
                    key={card.id} 
                    className="solution-card js-stagger-item interactive-card" 
                    style={{ padding: "24px", borderRadius: "12px", border: "1px solid var(--mission-panel-border)", transition: "transform 0.2s, box-shadow 0.2s", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start" }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--mission-shadow)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div className="solution-icon" style={{ background: "var(--mission-badge)", padding: "12px", borderRadius: "50%", marginBottom: "16px" }}>
                      <Icon className="h-5 w-5" style={{ color: "var(--mission-accent)" }} />
                    </div>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px", color: "var(--mission-text-primary)" }}>{card.title}</h3>
                    <p style={{ fontSize: "14px", marginBottom: "16px", flex: 1, minHeight: "80px", color: "var(--mission-text-secondary)" }}>{card.text}</p>
                    <span className="solution-link" style={{ color: "var(--mission-accent)", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                      Learn more
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-container footer-inner">
          <div>
            <p className="footer-title">MediaMind</p>
            <p className="footer-copy">
              Grounded question answering for reports, recordings, and video, with direct source navigation.
            </p>
          </div>
          <div className="footer-links">
            <a href="#solutions">Solutions</a>
            <a href="#workspace">Workspace</a>
            <a href="#conversation">Conversation</a>
          </div>
          <div className="footer-note">
            <span>FastAPI</span>
            <ArrowRight className="h-4 w-4" />
            <span>Next.js</span>
          </div>
        </div>
      </footer>

      {error ? <div className="floating-error">{error}</div> : null}

      {ttsState !== "stopped" && (
        <div className="fixed bottom-6 right-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col gap-3 w-72 z-[100] animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Now Reading</span>
            <button onClick={() => { window.speechSynthesis.cancel(); setTtsState("stopped"); setActiveChunkId(null); }} className="text-gray-400 hover:text-red-500 transition-colors">
              <Square className="h-4 w-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (ttsState === "playing") {
                  window.speechSynthesis.pause();
                  setTtsState("paused");
                } else {
                  window.speechSynthesis.resume();
                  setTtsState("playing");
                }
              }}
              className="w-10 h-10 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors shrink-0"
            >
              {ttsState === "playing" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-1" />}
            </button>
            
            <div className="flex-1 w-full">
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={ttsProgress} 
                onChange={handleSliderSeek}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
