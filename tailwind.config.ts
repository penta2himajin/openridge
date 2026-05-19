import type { Config } from "tailwindcss";

// Design tokens are defined as CSS custom properties in src/styles/global.css.
// This config re-exposes them to Tailwind so utilities like `bg-base`,
// `text-fg-default`, `border-fg-subtle` resolve. See docs/design.md §3.

export default {
  content: ["./src/**/*.{astro,html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--bg-base)",
          elevated: "var(--bg-elevated)",
          high: "var(--bg-high)",
        },
        fg: {
          default: "var(--fg-default)",
          muted: "var(--fg-muted)",
          subtle: "var(--fg-subtle)",
        },
        accent: "var(--accent)",
        frontier: "var(--frontier)",
        closed: "var(--closed)",
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // docs/design.md §3 typography ladder
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        md: "1.125rem",
        lg: "1.5rem",
        xl: "2rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
