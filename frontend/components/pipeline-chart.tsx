"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import type { ChatHistoryItem, FileRecord } from "@/lib/api";

type PipelineChartProps = {
  files: FileRecord[];
  chatHistory: ChatHistoryItem[];
  selectedFileIds: string[];
};

export function PipelineChart({ files, chatHistory, selectedFileIds }: PipelineChartProps) {
  const summary = useMemo(() => {
    const ready = files.filter((file) => file.status === "ready").length;
    const processing = files.filter(
      (file) => file.status === "processing" || file.status === "uploaded"
    ).length;
    const pdfCount = files.filter((file) => file.media_type === "pdf").length;
    const audioCount = files.filter((file) => file.media_type === "audio").length;
    const videoCount = files.filter((file) => file.media_type === "video").length;
    const textCount = files.filter((file) => file.media_type === "text" || file.media_type === "docx").length;

    const steps = [
      { label: "Captured", value: Math.max(files.length, 1) },
      { label: "Queued", value: Math.max(processing, 1) },
      { label: "Indexed", value: Math.max(ready, 1) },
      { label: "Scoped", value: Math.max(selectedFileIds.length || files.length, 1) },
      { label: "Answers", value: Math.max(chatHistory.length, 1) },
    ];

    const mediaMix = [
      { label: "PDF", value: pdfCount },
      { label: "Audio", value: audioCount },
      { label: "Video", value: videoCount },
      { label: "Text", value: textCount },
    ];

    return { steps, mediaMix };
  }, [files, chatHistory.length, selectedFileIds.length]);

  return (
    <div className="pipeline-chart-card js-reveal" style={{ padding: "32px", background: "#ffffff", borderRadius: "16px", boxShadow: "0 10px 40px rgba(0,0,0,0)", border: "1px solid #e1e4e8" }}>
      <div className="pipeline-chart-head" style={{ marginBottom: "32px" }}>
        <p className="pipeline-chart-kicker" style={{ color: "#2091d0", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Workspace Analytics</p>
        <h3 style={{ fontSize: "20px", margin: "8px 0", color: "#1a1a1a", fontWeight: 600 }}>Source flow & media distribution</h3>
        <p style={{ color: "#666", fontSize: "14px" }}>Live counts across ingest, indexing, scope selection, and answer activity.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        <div style={{ height: "220px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.steps} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2091d0" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#2091d0" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8a95a1" }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8a95a1" }} />
              <Tooltip cursor={{ stroke: '#2091d0', strokeWidth: 1, strokeDasharray: '4 4' }} contentStyle={{ borderRadius: '8px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="value" stroke="#2091d0" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" activeDot={{ r: 6, fill: '#2091d0', stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ height: "200px", borderTop: "1px solid #f0f0f0", paddingTop: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <h4 style={{ fontSize: "14px", color: "#5f6872", fontWeight: 600, margin: 0 }}>Media Format Mix</h4>
            <span style={{ fontSize: "12px", background: "#f1f5f9", padding: "4px 8px", borderRadius: "12px", color: "#64748b" }}>Live Dataset</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.mediaMix} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8a95a1" }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8a95a1" }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="value" fill="#93c5fd" radius={[6, 6, 0, 0]} activeBar={{ fill: '#3b82f6' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
