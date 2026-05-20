/**
 * ModelSelect — Claude 모델 선택 드롭다운.
 *
 * Settings.tsx 분할: 모델 옵션 목록을 한 곳에 모아 추후 추가/제거 용이.
 * 옵션 라벨은 storage.ts AppSettings.model 과 동기화 필요.
 */
import type { FC } from 'react';

interface Props {
  value: string;
  onChange: (model: string) => void;
}

interface ModelOption {
  value: string;
  label: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (권장, 균형)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (최고 품질, 비쌈)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (빠름, 저비용)' },
];

const ModelSelect: FC<Props> = ({ value, onChange }) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Claude 모델 선택"
      className="w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {MODEL_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export default ModelSelect;
