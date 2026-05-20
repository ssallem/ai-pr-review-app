/**
 * ThemeToggle — light/dark/system 3-way 토글.
 *
 * - aria-pressed 로 선택 상태를 스크린리더에 전달.
 * - 이모지(☀️ 🌙 🖥️)는 시각 라벨 — 글로벌 룰 예외.
 */
import type { FC } from 'react';

import type { AppSettings } from '../../lib/storage';

interface Props {
  value: AppSettings['theme'];
  onChange: (theme: AppSettings['theme']) => void;
}

const OPTIONS: Array<{ value: AppSettings['theme']; label: string }> = [
  { value: 'light', label: '☀️ 라이트' },
  { value: 'dark', label: '🌙 다크' },
  { value: 'system', label: '🖥️ 시스템' },
];

const ThemeToggle: FC<Props> = ({ value, onChange }) => {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`flex-1 px-4 py-2 rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
            value === opt.value
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-100'
              : 'border-border bg-surface hover:bg-surface-alt text-text-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
