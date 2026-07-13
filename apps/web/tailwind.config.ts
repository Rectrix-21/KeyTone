import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(220 14% 18%)",
        background: "hsl(220 35% 3%)",
        foreground: "hsl(210 20% 96%)",
        muted: "hsl(220 18% 14%)",
        accent: "hsl(192 95% 55%)",
        success: "hsl(144 70% 45%)",
        danger: "hsl(0 72% 55%)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
