import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
};

const toneClasses = {
  neutral: "border border-[var(--mission-panel-border)] bg-[var(--mission-panel-glass)] text-[var(--mission-text-primary)]",
  success: "border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400",
  warning: "border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
