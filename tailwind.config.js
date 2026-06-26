/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        courier: ['Courier New', 'Courier', 'monospace'],
        times: ['Times New Roman', 'Times', 'serif']
      },
      colors: {
        opossum: {
          50: '#f8f6f0',
          100: '#ede8d9',
          200: '#d9cfb3',
          300: '#c1af86',
          400: '#a8905e',
          500: '#8e7447',
          600: '#73593a',
          700: '#5a4330',
          800: '#3f2f23',
          900: '#241b16'
        }
      }
    }
  },
  plugins: []
}
