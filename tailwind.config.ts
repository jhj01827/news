import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg: '#0A0A0F',
        card: '#141418',
        'card-2': '#1C1C22',
        'text-primary': '#F0EDE6',
        'text-secondary': '#A0A0B0',
        'text-muted': '#8B8B9A',
        'text-disabled': '#5A5A6A',
      },
    },
  },
  plugins: [],
};

export default config;
