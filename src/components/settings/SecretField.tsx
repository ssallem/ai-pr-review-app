/**
 * SecretField — 시크릿(API 키/토큰) 입력 + 저장/삭제 컨트롤.
 *
 * 책임:
 *  - password 타입 입력 + "보기" 토글 (👁️/🙈).
 *  - 저장 버튼 (값 없으면 disabled, 저장 중 disabled).
 *  - 삭제 버튼 (hasSaved=true 일 때만 노출).
 *  - 저장 성공/실패 후 입력값을 즉시 비움 — 화면에 평문 잔존 방지.
 *
 * 정책:
 *  - onSave/onDelete 는 부모(Settings.tsx)가 storage.ts 호출 후 메시지 표시.
 *  - 이모지(👁️ 🙈)는 시각 라벨 — 글로벌 룰 예외.
 */
import { useState, type FC } from 'react';

interface Props {
  placeholder: string;
  /** true 이면 저장된 시크릿이 있어 "삭제" 버튼이 노출됨. */
  hasSaved: boolean;
  /** 저장 트리거 — 부모가 storage.ts setApiKey/setGithubToken 호출. */
  onSave: (value: string) => Promise<void>;
  /** 삭제 트리거 — 부모가 storage.ts deleteApiKey/deleteGithubToken 호출. */
  onDelete: () => Promise<void>;
  /** "보기" 토글 버튼의 aria-label. */
  toggleLabel: string;
}

const SecretField: FC<Props> = ({ placeholder, hasSaved, onSave, onDelete, toggleLabel }) => {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSave = async (): Promise<void> => {
    if (value === '' || busy) return;
    setBusy(true);
    try {
      await onSave(value);
      // 저장 성공/실패 무관하게 입력란을 비워 화면에 평문 잔존을 막는다.
      setValue('');
      setShow(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          className="flex-1 rounded-md border border-border bg-surface-alt px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={toggleLabel}
          className="px-3 py-2 rounded-md border border-border hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={value === '' || busy}
          className="px-4 py-2 rounded-md bg-brand-500 text-white font-semibold hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          저장
        </button>
        {hasSaved && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busy}
            className="px-4 py-2 rounded-md border border-severity-critical text-severity-critical hover:bg-red-50 dark:hover:bg-red-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-severity-critical disabled:opacity-50"
          >
            삭제
          </button>
        )}
      </div>
    </>
  );
};

export default SecretField;
