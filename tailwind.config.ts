import type { Config } from "tailwindcss";
// Design tokens derived from the Khushio logo and banner.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#25422D", 700: "#2F5A3C", 50: "#EEF3EA" },
        ivory: "#FAF5EA", cream: "#F4ECDD", sage: "#DCE5D3", sand: "#EADFCB",
        terracotta: { DEFAULT: "#D9693F", 600: "#C25A33" },
        ink: "#1F2A22",
      },
      fontFamily: { display: ["var(--font-display)", "Georgia", "serif"], sans: ["var(--font-body)", "system-ui", "sans-serif"] },
      borderRadius: { card: "1.25rem" },
      maxWidth: { page: "76rem" },
    },
  },
  plugins: [],
} satisfies Config;
