import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1F3A", 50: "#EEF2F8", 100: "#D5DEEC", 200: "#A9BBD6", 300: "#6F8DB8", 400: "#3E6497", 500: "#1E4476", 600: "#15335C", 700: "#0F2748", 800: "#0B1F3A", 900: "#07152A" },
        bay: { DEFAULT: "#2F6BFF", 50: "#EEF3FF", 100: "#DCE6FF", 200: "#B5C9FF", 300: "#86A6FF", 400: "#5885FF", 500: "#2F6BFF", 600: "#1F55E0", 700: "#1943B3", 800: "#16388F", 900: "#132F73" },
        coral: { DEFAULT: "#FF6B57", 50: "#FFF1EE", 100: "#FFE0DA", 200: "#FFC0B5", 300: "#FF9C8C", 400: "#FF8270", 500: "#FF6B57", 600: "#E9503C", 700: "#C23D2C", 800: "#9A3124", 900: "#7C2A20" },
        cream: { DEFAULT: "#FBF6EE", 100: "#FBF6EE", 200: "#F4EBDC", 300: "#EADBC3" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { "4xl": "2rem" },
      boxShadow: {
        card: "0 1px 2px rgba(11,31,58,0.06), 0 8px 24px -12px rgba(11,31,58,0.18)",
        lift: "0 2px 4px rgba(11,31,58,0.06), 0 18px 40px -16px rgba(11,31,58,0.28)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
