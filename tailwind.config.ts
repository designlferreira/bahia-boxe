import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Bebas Neue'", "sans-serif"],
        sans: ["'Inter Variable'", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        amber: {
          DEFAULT: "hsl(var(--amber))",
          foreground: "hsl(var(--amber-foreground))",
        },
        raised: "hsl(var(--surface-raised))",
        overlay: "hsl(var(--surface-overlay))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 0.25rem)",
        sm: "calc(var(--radius) - 0.5rem)",
        xl: "calc(var(--radius) + 0.25rem)",
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        card: "var(--shadow-card)",
      },
      backgroundImage: {
        "gradient-hero": "var(--gradient-hero)",
        "gradient-gold": "var(--gradient-gold)",
      },
      keyframes: {
        "bb-in": {
          from: { opacity: "0", transform: "translateY(14px) scale(.99)" },
          to: { opacity: "1", transform: "none" },
        },
        "bb-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        "bb-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.35)" },
          "50%": { boxShadow: "0 0 0 14px hsl(var(--primary) / 0)" },
        },
        "bb-shimmer": {
          "0%": { backgroundPosition: "-260px 0" },
          "100%": { backgroundPosition: "260px 0" },
        },
        "bb-bar": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "bb-toast": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "none" },
        },
        "dialog-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(.98)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "bb-spin": {
          to: { transform: "rotate(360deg)" },
        },
        // Aula recém-agendada "acende" na Home: um contorno dourado que aparece e some uma vez. Só sombra, nada se desloca.
        "bb-acende": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--accent) / 0), 0 0 0 0 hsl(var(--accent) / 0)" },
          "30%": { boxShadow: "0 0 0 2px hsl(var(--accent) / 0.85), 0 0 22px 0 hsl(var(--accent) / 0.28)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--accent) / 0), 0 0 0 0 hsl(var(--accent) / 0)" },
        },
        // Item resolvido sai: esmaece e a linha (grid 1fr -> 0fr) fecha o espaço, em vez de sumir de uma vez e puxar a lista.
        "bb-sai": {
          from: { opacity: "1", gridTemplateRows: "1fr" },
          to: { opacity: "0", gridTemplateRows: "0fr" },
        },
        // Selo de status que acabou de mudar: pequena pulsada de escala.
        "bb-pop": {
          "0%": { opacity: "0.55", transform: "scale(0.86)" },
          "60%": { opacity: "1", transform: "scale(1.08)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "bb-in": "bb-in .35s ease both",
        "bb-up": "bb-up .45s ease both",
        "bb-pulse": "bb-pulse 3.2s ease-in-out infinite",
        "bb-shimmer": "bb-shimmer 1.1s infinite",
        "bb-bar": "bb-bar .7s cubic-bezier(.22,1,.36,1) both",
        "bb-toast": "bb-toast .3s cubic-bezier(.22,1,.36,1) both",
        "dialog-in": "dialog-in .18s ease both",
        "bb-spin": "bb-spin 4s linear infinite",
        "bb-acende": "bb-acende 1.6s ease-out .4s 1",
        "bb-sai": "bb-sai .22s cubic-bezier(.4,0,1,1) forwards",
        "bb-pop": "bb-pop .38s cubic-bezier(.16,1,.3,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
