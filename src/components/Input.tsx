/**
 * 메인 입력 화면 — GitHub PR URL → 리뷰 시작.
 *
 * 책임:
 *  - URL 입력 + 실시간 검증 (parsePRUrl).
 *  - "리뷰 시작" 버튼 / Enter → 부모 onStart 콜백 호출.
 *  - 최근 리뷰 5건 표시 (재실행 편의).
 *  - 로딩 상태 (isReviewing) / 에러 (error) 표시.
 *
 * 단방향 데이터 흐름:
 *  - 입력 상태(useState)는 로컬, 리뷰 실행/결과는 부모(App.tsx)가 보유.
 *  - props.isReviewing 이 true→false 로 떨어질 때 최근 목록 다시 로드.
 *
 * 시스템 경계 검증:
 *  - URL 은 parsePRUrl 로 검증 후에만 전달 → owner/repo/number 타입 보장.
 */
import { useEffect, useState, type FC } from 'react';

import { parsePRUrl } from '../lib/githubClient';
import { getRecentReviews, type RecentReview } from '../lib/storage';

interface Props {
  /** 사용자가 "리뷰 시작" 누르면 호출. 부모가 실제 fetch + reviewDiff 실행. */
  onStart: (prUrl: string) => void;
  /** 리뷰 진행 중이면 input/버튼 비활성. */
  isReviewing: boolean;
  /** 부모가 발생시킨 에러 메시지. */
  error: string | null;
}

const Input: FC<Props> = ({ onStart, isReviewing, error }) => {
  const [url, setUrl] = useState('');
  const [recent, setRecent] = useState<RecentReview[]>([]);

  // 리뷰 종료(false 로 떨어지는 시점) 마다 최근 목록 갱신.
  useEffect(() => {
    setRecent(getRecentReviews());
  }, [isReviewing]);

  const parsed = url.trim() ? parsePRUrl(url.trim()) : null;
  const isValid = parsed !== null;

  const handleStart = (): void => {
    if (!isValid || isReviewing) return;
    onStart(url.trim());
  };

  const handleRecentClick = (prUrl: string): void => {
    setUrl(prUrl);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-500 mb-2">PR 리뷰</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary leading-tight">
          GitHub PR 링크를 붙여넣으세요
        </h2>
        <p className="mt-3 text-text-secondary">
          AI가 한국어로 코드 리뷰를 작성합니다. 약 3~5분 소요.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
        <label htmlFor="pr-url" className="block text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">
          PR URL
        </label>
        <input
          id="pr-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
          placeholder="https://github.com/owner/repo/pull/123"
          disabled={isReviewing}
          className="w-full rounded-md border border-border bg-surface-alt px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
        />

        {parsed !== null && (
          <p className="mt-2 text-xs text-text-secondary">
            ✓ {parsed.owner}/{parsed.repo} #{parsed.number}
          </p>
        )}

        {error !== null && (
          <p role="alert" className="mt-3 text-sm text-severity-critical">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={!isValid || isReviewing}
          className="mt-6 w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isReviewing ? '리뷰 진행 중... (3~5분)' : '리뷰 시작'}
        </button>
      </section>

      {recent.length > 0 && (
        <section className="mt-8" aria-label="최근 리뷰 기록">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">최근 리뷰</h3>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => handleRecentClick(r.pr_url)}
                  className="w-full text-left p-3 rounded-md border border-border bg-surface hover:bg-surface-alt transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <p className="text-sm font-medium text-text-primary truncate">{r.pr_title}</p>
                  <p className="text-xs text-text-muted mt-1 font-mono truncate">{r.pr_url}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {new Date(r.date).toLocaleDateString('ko-KR')} · CRITICAL {r.critical} · WARNING {r.warning} · SUGGESTION {r.suggestion}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default Input;
