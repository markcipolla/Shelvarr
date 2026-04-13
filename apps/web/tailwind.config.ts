import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        shelvarr: {
          bg: '#0f0f0f',
          surface: '#1a1a1a',
          border: '#2a2a2a',
          primary: '#3b82f6',
          'primary-hover': '#2563eb',
          text: '#e5e5e5',
          'text-muted': '#a0a0a0',
        },
      },
    },
  },
  plugins: [],
};

export default config;
