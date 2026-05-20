/** @type {import('tailwindcss').Config} */
// 사이트(`D:\dev\ai-pr-review-toolkit\web\tailwind.config.mjs`)와 동일한 토큰 — 변경 시 양쪽 동기화 필요.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          50:  'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
          900: 'var(--color-brand-900)',
        },
        surface:       'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        border:        'var(--color-border)',
        text: {
          primary:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted:     'var(--color-text-muted)',
        },
        severity: {
          critical:   'var(--color-critical)',
          warning:    'var(--color-warning)',
          suggestion: 'var(--color-suggestion)',
          info:       'var(--color-info)',
        },
      },
    },
  },
  plugins: [],
};
