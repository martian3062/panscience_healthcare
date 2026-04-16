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
  Sparkles,
  UploadCloud,
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
} from "@/lib/api";

const solutionCards = [
  {
    id: "pdf-insights",
    title: "Document intelligence",
    text: "Anchor every answer to the exact page, extracted passage, and source file.",
    image:
      "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=900&q=80",
    icon: FileText,
  },
  {
    id: "audio-moments",
    title: "Audio moments",
    text: "Transcribe long recordings and jump to the exact second where a topic appears.",
    image:
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=900&q=80",
    icon: Mic2,
  },
  {
    id: "video-evidence",
    title: "Video evidence",
    text: "Surface answer-backed timestamps so teams can verify context without scrubbing.",
    image:
      "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80",
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
        const grade = sampleMissionGrade((now - startedAt) / 1000, pointerRef.current);
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

  return (
    <div ref={rootRef} className="site-shell" onMouseMove={handlePointerMove}>
      <MissionBackground pointer={pointer} />

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

            <label className="site-cta">
              <span>{uploading ? "Uploading..." : "Upload Source"}</span>
              <input
                className="hidden"
                type="file"
                accept=".pdf,.mp3,.wav,.m4a,.mp4,.mov,.mkv,.webm,.txt,.md"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
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

              <div className="hero-actions">
                <Button onClick={() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" })}>
                  Open Workspace
                </Button>
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("solutions")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Explore Capabilities
                </Button>
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

        <section className="section-block js-reveal" id="solutions">
          <div className="site-container">
            <div className="section-heading">
              <span className="section-kicker">Core capabilities</span>
              <h2>Built for mixed media retrieval, not just keyword search.</h2>
              <p>
                Search across long reports, calls, and lectures with page citations, transcript evidence, and
                timestamp navigation baked into the product surface.
              </p>
            </div>

            <div className="solution-grid js-stagger-group">
              {solutionCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.id} className="solution-card js-stagger-item">
                    <div className="solution-image-wrap">
                      <img src={card.image} alt={card.title} className="solution-image" />
                    </div>
                    <div className="solution-body">
                      <div className="solution-icon">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3>{card.title}</h3>
                      <p>{card.text}</p>
                      <span className="solution-link">
                        Learn more
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </article>
                );
              })}
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
                    <div className="source-badges">
                      <Badge>{mediaLabel(selectedFile.media_type)}</Badge>
                      <Badge tone={statusTone(selectedFile.status)}>{selectedFile.status}</Badge>
                      {selectedFile.page_count ? <Badge>{selectedFile.page_count} pages</Badge> : null}
                      {selectedFile.duration_seconds ? <Badge>{formatTime(selectedFile.duration_seconds)}</Badge> : null}
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

                    {selectedFile.media_type === "pdf" || selectedFile.media_type === "text" ? (
                      <a
                        className="inline-link"
                        href={assetUrl(activeFile.media_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open original file
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
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
                            <div key={chunk.id} className="chunk-row">
                              <div className="chunk-meta">
                                <span>#{chunk.order_index + 1}</span>
                                {chunk.page_number != null ? <span>Page {chunk.page_number}</span> : null}
                                {chunk.timestamp_start != null ? (
                                  <span>
                                    {formatTime(chunk.timestamp_start)}-{formatTime(chunk.timestamp_end)}
                                  </span>
                                ) : null}
                              </div>
                              <p>{chunk.text}</p>
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
    </div>
  );
}
