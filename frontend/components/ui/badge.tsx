import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
};

const toneClasses = {
  neutral: "border border-[#dde2e7] bg-white text-foreground",
  success: "border border-[#d3e9db] bg-[#f1fbf5] text-[#2f7c4a]",
  warning: "border border-[#eadccf] bg-[#fbf5f0] text-[#9d6f48]",
  danger: "border border-[#f0d8d8] bg-[#fff5f5] text-[#b15b5b]",
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
