/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Map the Beam palette (CSS variables in index.css) onto Tailwind colors
      // so utilities like `bg-panel` / `text-muted` work.
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        ok: "var(--ok)",
        err: "var(--err)",
      },
      fontFamily: {
        // UI grotesk vs. mono for all data readouts.
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Geist Mono'", "ui-monospace", "monospace"],
      },
      keyframes: {
        // Calm idle pulse for the radar rings.
        "radar-pulse": {
          "0%": { transform: "scale(0.6)", opacity: "0.5" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
      animation: {
        "radar-pulse": "radar-pulse 4s ease-out infinite",
      },
    },
  },
  plugins: [],
};
