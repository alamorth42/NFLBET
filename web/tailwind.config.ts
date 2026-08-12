import type { Config } from "tailwindcss";

// Palette reprise du design (docs/design-source.readable.html)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F0C",
        s1: "#141A16",
        s2: "#1D2620",
        line: "#2A342C",
        tx: "#E8EFE9",
        mu: "#93A197",
        dim: "#6E7D74",
        gr: "#45D07A",
        am: "#FFA92E",
        rd: "#E06060",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "60%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: { popIn: "popIn 240ms ease both" },
    },
  },
  plugins: [],
};
export default config;
