/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // enables 'dark:' classes via .dark on <html>
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Urbanist", "system-ui", "Avenir", "Helvetica", "Arial", "sans-serif"],
      },
      colors: {
        background: {
          light: "#ffffff",
          dark: "#121212"
        },
        foreground: {
          light: "#000000",
          dark: "#ffffff"
        }
      }
    },
  },
  plugins: [],
}


