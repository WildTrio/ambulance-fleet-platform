/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "Inter", "system-ui", "-apple-system", "sans-serif"],
        body: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        border: "rgb(226, 232, 240)", // Slate 200
        background: "#FFFFFF",
        foreground: "rgb(15, 23, 42)", // Slate 900
        primary: {
          DEFAULT: "#000000",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "rgb(241, 245, 249)", // Slate 100
          foreground: "rgb(15, 23, 42)",
        },
        muted: {
          DEFAULT: "rgb(248, 250, 252)", // Slate 50
          foreground: "rgb(100, 116, 139)", // Slate 500
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "rgb(15, 23, 42)",
        },
        emergency: {
          DEFAULT: "#EF4444", // Red
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#10B981", // Green
          foreground: "#FFFFFF",
        },
        info: {
          DEFAULT: "#3B82F6", // Blue
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        soft: "0 2px 8px rgba(0, 0, 0, 0.04)",
        card: "0 4px 20px -2px rgba(0, 0, 0, 0.03), 0 2px 8px -1px rgba(0, 0, 0, 0.02)",
      },
    },
  },
  plugins: [],
}
