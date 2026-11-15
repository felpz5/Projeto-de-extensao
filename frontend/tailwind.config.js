/** Tema do PLANEJAMENTO.md (seção 8): azul-marinho, branco e um destaque. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0A1628', 900: '#0F2040', 800: '#162B52', 700: '#1E3A6B', 600: '#2A4C86' },
        muted: '#A9B8D0',
        accent: { DEFAULT: '#38BDF8', strong: '#0EA5E9' },
        warning: '#F59E0B',
        danger: '#EF4444',
        success: '#22C55E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      // Animações contínuas da página de apresentação (sempre usadas com motion-safe:).
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(40px, -50px) scale(1.12)' },
          '66%': { transform: 'translate(-30px, 30px) scale(0.92)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(56, 189, 248, 0.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(56, 189, 248, 0)' },
        },
        shine: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        blob: 'blob 18s ease-in-out infinite',
        marquee: 'marquee 30s linear infinite',
        glow: 'glow 2.4s ease-out infinite',
        shine: 'shine 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
