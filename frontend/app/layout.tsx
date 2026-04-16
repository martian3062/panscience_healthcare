import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SmoothScrollProvider } from "@/components/smooth-scroll-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "MediaMind",
  description: "Multimedia QA workspace built with Next.js and FastAPI.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
