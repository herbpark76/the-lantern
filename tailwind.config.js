/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', '"Book Antiqua"', 'Palatino', 'Georgia', 'serif'],
        sans: ['"SF Pro Text"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', '"Cascadia Code"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          50: '#faf9f7',
          100: '#f5f3ef',
          200: '#e8e4dc',
          300: '#d4cec1',
          400: '#a89f8e',
          500: '#7a7160',
          600: '#5c5447',
          700: '#453f35',
          800: '#2e2a23',
          900: '#1c1a16',
          950: '#121110',
        },
        accent: {
          50: '#fdf6f0',
          100: '#f9e6d5',
          200: '#f0ccb0',
          300: '#e4ad82',
          400: '#d68d56',
          500: '#c97b3a',
          600: '#b0642e',
          700: '#8f4d27',
          800: '#713f25',
          900: '#5d3522',
          950: '#331a0f',
        },
        success: {
          500: '#5a8a6e',
          600: '#4a7a5e',
        },
        warning: {
          500: '#c99a3a',
          600: '#b0842e',
        },
        error: {
          500: '#c95a5a',
          600: '#b04a4a',
        },
      },
      spacing: {
        '18': '4.5rem',
      },
      lineHeight: {
        'relaxed': '1.75',
        'loose': '2',
        'prose': '1.6',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
