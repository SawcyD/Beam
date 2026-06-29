/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "var(--bg)",
        surface:  "var(--surface)",
        panel:    "var(--panel)",
        "panel-2": "var(--panel-2)",
        border:   "var(--border)",
        "border-mid": "var(--border-mid)",
        text:     "var(--text)",
        muted:    "var(--muted)",
        accent:   "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        ok:       "var(--ok)",
        err:      "var(--err)",
      },
      fontFamily: {
        // Win11 system typeface with graceful cross-platform fallbacks.
        sans: [
          "Segoe UI Variable Text",
          "Segoe UI Variable",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        // Keep JetBrains Mono for all telemetry numbers.
        mono: ["'JetBrains Mono'", "'Geist Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs:  "var(--r-xs)",
        sm:  "var(--r-sm)",
        md:  "var(--r-md)",
        lg:  "var(--r-lg)",
        xl:  "var(--r-xl)",
        "2xl": "var(--r-2xl)",
      },
      boxShadow: {
        xs:  "var(--shadow-xs)",
        sm:  "var(--shadow-sm)",
        md:  "var(--shadow-md)",
        lg:  "var(--shadow-lg)",
      },
      backdropBlur: {
        fluent: "24px",
      },
      keyframes: {
        "radar-pulse": {
          "0%":   { transform: "translate3d(0, 0, 0) scale(calc(var(--base-scale, 1) * 0.55))", opacity: "0.6" },
          "100%": { transform: "translate3d(0, 0, 0) scale(calc(var(--base-scale, 1) * 1.9))",  opacity: "0" },
        },
        "beam-flash": {
          "0%":   { opacity: "0", transform: "scaleX(0)" },
          "40%":  { opacity: "1", transform: "scaleX(1)" },
          "100%": { opacity: "0", transform: "scaleX(1)" },
        },
      },
      animation: {
        "radar-pulse": "radar-pulse 4s ease-out infinite",
        "beam-flash":  "beam-flash 0.6s ease-out forwards",
      },
    },
  },
  plugins: [],
};
