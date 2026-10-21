/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: '#000000',
        panel: '#0A0A0A',
        rowHover: '#1F1F1F',
        border: '#262626',
        text: '#EDEDED',
        muted: '#A1A1A1',
        accent: '#EDEDED',
        done: '#46A758',
        skip: '#F5A623',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
