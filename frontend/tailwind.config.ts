import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f7f7f8",
        foreground: "#30353b",
        panel: "#ffffff",
        accent: "#2091d0",
        accentSoft: "#edf5fb",
        warm: "#6f7f8f",
        border: "#e3e6ea",
        muted: "#6f7782",
        lime: "#4e90b8",
      },
    },
  },
  plugins: [],
};

export default config;
