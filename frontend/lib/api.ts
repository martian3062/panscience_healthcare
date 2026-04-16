export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type FileRecord = {
  id: string;
  filename: string;
  stored_name: string;
  content_type: string;
  media_type: "pdf" | "audio" | "video" | "text";
  status: "uploaded" | "processing" | "ready" | "failed";
  summary: string | null;
  error: string | null;
  uploaded_at: string;
  processed_at: string | null;
  duration_seconds: number | null;
  page_count: number | null;
  transcript_available: boolean;
  media_url: string;
};

export type ChunkPreview = {
  id: string;
  order_index: number;
  text: string;
  page_number: number | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
};

export type FileDetail = FileRecord & {
  chunks: ChunkPreview[];
  chunk_count: number;
};

export type Citation = {
  chunk_id: string;
  file_id: string;
  file_name: string;
  excerpt: string;
  page_number: number | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
  media_url: string;
  score: number;
};

export type ChatResponse = {
  answer: string;
  provider: string;
  citations: Citation[];
  created_at: string;
};

export type ChatHistoryItem = {
  id: string;
  question: string;
  answer: string;
  provider: string;
  created_at: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const apiKey = process.env.NEXT_PUBLIC_APP_API_KEY || "demo-key";
  headers.set("X-API-Key", apiKey);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function assetUrl(mediaUrl: string): string {
  return `${API_BASE_URL}${mediaUrl}`;
}

export async function listFiles(): Promise<FileRecord[]> {
  return apiFetch<FileRecord[]>("/api/files");
}

export async function getFile(fileId: string): Promise<FileDetail> {
  return apiFetch<FileDetail>(`/api/files/${fileId}`);
}

export async function uploadFile(file: File): Promise<FileRecord> {
  const formData = new FormData();
  formData.append("file", file);
  const result = await apiFetch<{ file: FileRecord }>("/api/files/upload", {
    method: "POST",
    body: formData,
  });
  return result.file;
}

export async function deleteFile(fileId: string): Promise<void> {
  await apiFetch(`/api/files/${fileId}`, { method: "DELETE" });
}

export async function queryChat(payload: {
  question: string;
  file_ids: string[];
  top_k?: number;
}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/chat/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getChatHistory(): Promise<ChatHistoryItem[]> {
  const result = await apiFetch<{ items: ChatHistoryItem[] }>("/api/chat/history");
  return result.items;
}

export async function streamChatQuery(
  payload: { question: string; file_ids: string[]; top_k?: number },
  onChunk: (text: string) => void,
  onFinish: (result: ChatResponse) => void,
  onError: (error: Error) => void
) {
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    const apiKey = process.env.NEXT_PUBLIC_APP_API_KEY || "demo-key";
    headers.set("X-API-Key", apiKey);

    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No readable stream");
    const decoder = new TextDecoder();
    
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          const jsonStr = part.slice(6);
          if (jsonStr === "[DONE]") continue;
          
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === "chunk") {
              onChunk(data.text);
            } else if (data.type === "end") {
              onFinish({
                answer: "", 
                provider: "stream",
                citations: data.citations,
                created_at: data.created_at
              });
            }
          } catch {
            // ignore partial JSON parse errors
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

