/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/public/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        // *arr-style dark theme colors
        'shelvarr': {
          'bg': '#1a1d23',
          'surface': '#242830',
          'surface-light': '#2d323c',
          'border': '#3d4350',
          'primary': '#3b82f6',
          'primary-hover': '#2563eb',
          'success': '#22c55e',
          'warning': '#eab308',
          'danger': '#ef4444',
          'text': '#e5e7eb',
          'text-muted': '#9ca3af',
        }
      }
    },
  },
  plugins: [],
}
