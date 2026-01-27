/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Unis brand colors - we'll refine these as we port
        'unis-dark': '#1a1a1a',
        'unis-purple': '#8b5cf6',
        'unis-gold': '#f59e0b',
      }
    },
  },
  plugins: [],
}