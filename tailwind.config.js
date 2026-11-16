/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/**/*.{html,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        mica: {
          bg: "rgb(var(--mica-bg) / <alpha-value>)",
          border: "rgb(var(--mica-border) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
  plugins: [],
};
