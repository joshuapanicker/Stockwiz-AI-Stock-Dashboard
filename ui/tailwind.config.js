/** @type {import('tailwindcss').Config} */
// "Pulse" palette — deep-space ground, pulse teal, aurora violet.
// Token names are unchanged so existing utility classes pick up the new values.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0D12",
        card: "#10131A",
        card2: "#171C29",
        border: "#272E40",
        green: { DEFAULT: "#2EE6A8", dim: "#1FC48D" },
        purple: { DEFAULT: "#8055F5", dim: "#6A45D9" },
        orange: { DEFAULT: "#FFAC26" },
        red: { DEFAULT: "#FF5C7A" },
        sky: { DEFAULT: "#3FA7FC" },
        muted: "#6E7787",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        // Landing "judgment" voice — data is mono, reasoning is serif.
        serif: ['"Instrument Serif"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
