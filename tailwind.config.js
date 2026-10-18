/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: '#0B0B0F',
        panel: '#15151B',
        rowHover: '#1C1C24',
        border: '#26262F',
        text: '#E8E8EE',
        muted: '#8A8A98',
        accent: '#6D5BF6',
        done: '#22A559',
        skip: '#E65100',
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
