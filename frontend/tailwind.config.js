/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: '#05070C',
          navy: '#0B1420',
          elevated: 'rgba(11, 20, 32, 0.75)',
          card: 'rgba(255, 255, 255, 0.04)',
          cardHover: 'rgba(255, 255, 255, 0.07)',
        },
        signal: {
          amber: '#E8A33D',
          amberLight: '#F4C766',
          amberGlow: 'rgba(232, 163, 61, 0.35)',
          red: '#C1443C',
          redLight: '#E56057',
          redGlow: 'rgba(193, 68, 60, 0.35)',
          green: '#2E8B57',
          greenLight: '#3DAB6E',
          greenGlow: 'rgba(46, 139, 87, 0.35)',
          steel: '#3E6C8A',
          steelLight: '#5C8FA8',
          steelGlow: 'rgba(62, 108, 138, 0.35)',
        },
        rail: {
          text: '#F4F6F8',
          muted: '#9BAAB5',
          faint: '#5C6D7A',
          border: 'rgba(255, 255, 255, 0.12)',
          borderSubtle: 'rgba(255, 255, 255, 0.06)',
          borderHover: 'rgba(232, 163, 61, 0.4)',
        }
      },
      fontFamily: {
        display: ['Outfit', 'Cabinet Grotesk', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'amber-glow': '0 0 30px -5px rgba(232, 163, 61, 0.4)',
        'steel-glow': '0 0 30px -5px rgba(62, 108, 138, 0.4)',
        'green-glow': '0 0 30px -5px rgba(46, 139, 87, 0.4)',
        'red-glow': '0 0 30px -5px rgba(193, 68, 60, 0.4)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'light-streak': 'lightStreak 3s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        lightStreak: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        }
      }
    },
  },
  plugins: [],
}
