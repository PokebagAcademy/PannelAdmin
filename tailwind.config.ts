import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        ink: {
          950: '#0a0c0a',
          900: '#0f120f',
          800: '#161a16',
          700: '#1f241f',
          600: '#2e362e',
          500: '#56605a', // was #3a423a — now AA-readable on ink-950
          400: '#838b82', // was #6a736a — now AAA-readable
          300: '#a8b0a6', // slight bump
          200: '#cfd5ce',
          100: '#ebefea',
        },
        amber: {
          DEFAULT: '#d8a04a',
          soft: '#b88736',
          warm: '#e6b667',
        },
        phosphor: {
          DEFAULT: '#7fd396',
          dim: '#4e9866',
          glow: '#a3e8b6',
        },
        rust: '#c4523a',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(216,160,74,.2), 0 0 24px -8px rgba(216,160,74,.35)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,.04)',
      },
      keyframes: {
        scan: {
          '0%, 100%': { opacity: '0.05' },
          '50%': { opacity: '0.12' },
        },
        cursorBlink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        reveal: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        scan: 'scan 4s ease-in-out infinite',
        cursor: 'cursorBlink 1.1s steps(1) infinite',
        reveal: 'reveal .4s ease-out both',
      },
    },
  },
}
export default config
