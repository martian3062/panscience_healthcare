"use client";

import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";

import type { ChatHistoryItem, FileRecord } from "@/lib/api";

type PipelineChartProps = {
  files: FileRecord[];
  chatHistory: ChatHistoryItem[];
  selectedFileIds: string[];
};

type StepPoint = {
  label: string;
  value: number;
};

export function PipelineChart({ files, chatHistory, selectedFileIds }: PipelineChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const summary = useMemo(() => {
    const ready = files.filter((file) => file.status === "ready").length;
    const processing = files.filter(
      (file) => file.status === "processing" || file.status === "uploaded"
    ).length;
    const pdfCount = files.filter((file) => file.media_type === "pdf").length;
    const audioCount = files.filter((file) => file.media_type === "audio").length;
    const videoCount = files.filter((file) => file.media_type === "video").length;
    const textCount = files.filter((file) => file.media_type === "text").length;

    const steps: StepPoint[] = [
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

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = 560;
    const height = 260;
    const topHeight = 154;
    const margins = { top: 18, right: 18, bottom: 24, left: 18 };
    const baseline = topHeight - 10;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const steps = summary.steps;
    const mediaMix = summary.mediaMix;
    const maxValue = Math.max(d3.max(steps, (step) => step.value) ?? 1, 1);

    const x = d3
      .scalePoint<string>()
      .domain(steps.map((step) => step.label))
      .range([margins.left, width - margins.right]);

    const y = d3
      .scaleLinear()
      .domain([0, maxValue])
      .range([baseline, margins.top]);

    const line = d3
      .line<StepPoint>()
      .x((point) => x(point.label) ?? 0)
      .y((point) => y(point.value))
      .curve(d3.curveMonotoneX);

    const area = d3
      .area<StepPoint>()
      .x((point) => x(point.label) ?? 0)
      .y0(baseline)
      .y1((point) => y(point.value))
      .curve(d3.curveMonotoneX);

    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "pipelineFill")
      .attr("x1", "0%")
      .attr("x2", "0%")
      .attr("y1", "0%")
      .attr("y2", "100%");

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#2091d0").attr("stop-opacity", 0.22);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#2091d0").attr("stop-opacity", 0.03);

    const stage = svg.append("g");

    stage
      .append("path")
      .datum(steps)
      .attr("d", area)
      .attr("fill", "url(#pipelineFill)");

    stage
      .append("path")
      .datum(steps)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "#2091d0")
      .attr("stroke-width", 2.4)
      .attr("stroke-linecap", "round");

    stage
      .selectAll("circle")
      .data(steps)
      .join("circle")
      .attr("cx", (point) => x(point.label) ?? 0)
      .attr("cy", (point) => y(point.value))
      .attr("r", 4.5)
      .attr("fill", "#ffffff")
      .attr("stroke", "#2091d0")
      .attr("stroke-width", 2);

    stage
      .selectAll(".pipeline-label")
      .data(steps)
      .join("text")
      .attr("x", (point) => x(point.label) ?? 0)
      .attr("y", baseline + 20)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#8a95a1")
      .text((point) => point.label);

    stage
      .selectAll(".pipeline-value")
      .data(steps)
      .join("text")
      .attr("x", (point) => x(point.label) ?? 0)
      .attr("y", (point) => y(point.value) - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#3f4954")
      .text((point) => point.value);

    const barTop = 184;
    const barHeight = 52;
    const barScale = d3
      .scaleLinear()
      .domain([0, Math.max(d3.max(mediaMix, (entry) => entry.value) ?? 1, 1)])
      .range([0, 104]);

    const barBand = d3
      .scaleBand<string>()
      .domain(mediaMix.map((entry) => entry.label))
      .range([margins.left, width - margins.right])
      .paddingInner(0.22);

    svg
      .append("text")
      .attr("x", margins.left)
      .attr("y", barTop - 10)
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#5f6872")
      .text("Media mix");

    const bars = svg.append("g");

    bars
      .selectAll("rect")
      .data(mediaMix)
      .join("rect")
      .attr("x", (entry) => barBand(entry.label) ?? 0)
      .attr("y", (entry) => barTop + barHeight - barScale(Math.max(entry.value, 0)))
      .attr("width", barBand.bandwidth())
      .attr("height", (entry) => Math.max(4, barScale(Math.max(entry.value, 0))))
      .attr("rx", 4)
      .attr("fill", "#dfeffc");

    bars
      .selectAll(".bar-value")
      .data(mediaMix)
      .join("text")
      .attr("x", (entry) => (barBand(entry.label) ?? 0) + barBand.bandwidth() / 2)
      .attr("y", (entry) => barTop + barHeight - barScale(Math.max(entry.value, 0)) - 8)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#6f7782")
      .text((entry) => entry.value);

    bars
      .selectAll(".bar-label")
      .data(mediaMix)
      .join("text")
      .attr("x", (entry) => (barBand(entry.label) ?? 0) + barBand.bandwidth() / 2)
      .attr("y", barTop + barHeight + 18)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#8a95a1")
      .text((entry) => entry.label);
  }, [summary]);

  return (
    <div className="pipeline-chart-card js-reveal">
      <div className="pipeline-chart-head">
        <p className="pipeline-chart-kicker">D3 pipeline snapshot</p>
        <h3>Source flow and media distribution</h3>
        <p>Live counts across ingest, indexing, scope selection, and answer activity.</p>
      </div>
      <svg ref={svgRef} className="pipeline-chart-svg" aria-label="Pipeline chart" />
    </div>
  );
}
