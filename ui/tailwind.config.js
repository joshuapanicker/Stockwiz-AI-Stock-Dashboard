/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d0d0f",
        card: "#131318",
        card2: "#1a1a22",
        border: "#2a2a35",
        green: { DEFAULT: "#00e676", dim: "#00c853" },
        purple: { DEFAULT: "#7c3aed", dim: "#5b21b6" },
        orange: { DEFAULT: "#ff6d00" },
        red: { DEFAULT: "#ff1744" },
        muted: "#6b7280",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
