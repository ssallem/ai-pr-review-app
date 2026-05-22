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
          50:  'rgb(var(--color-brand-50) / <alpha-value>)',
          100: 'rgb(var(--color-brand-100) / <alpha-value>)',
          200: 'rgb(var(--color-brand-200) / <alpha-value>)',
          500: 'rgb(var(--color-brand-500) / <alpha-value>)',
          600: 'rgb(var(--color-brand-600) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
          900: 'rgb(var(--color-brand-900) / <alpha-value>)',
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
