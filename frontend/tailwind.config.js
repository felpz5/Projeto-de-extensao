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
        // Transições do app (troca de página, gaveta, menus suspensos).
        'page-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'drawer-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0)' },
          '20%, 60%': { transform: 'rotate(-12deg)' },
          '40%, 80%': { transform: 'rotate(12deg)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.97)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        blob: 'blob 18s ease-in-out infinite',
        marquee: 'marquee 30s linear infinite',
        glow: 'glow 2.4s ease-out infinite',
        shine: 'shine 6s ease-in-out infinite',
        'page-in': 'page-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'drawer-in': 'drawer-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
        'pop-in': 'pop-in 0.18s ease-out',
        'sheet-up': 'sheet-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
