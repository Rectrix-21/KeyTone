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
    },
  },
  plugins: [],
};

export default config;
