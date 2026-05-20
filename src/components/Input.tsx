/**
 * 메인 입력 화면 — GitHub PR / commit / compare / repo URL → 리뷰 시작.
 *
 * 책임:
 *  - URL 입력 + 실시간 검증 (PR → commit → compare → repo 순서로 분기).
 *  - PR/commit/compare URL 감지 시 즉시 "리뷰 시작" 버튼 활성.
 *  - Repo URL 감지 시 최근 PR 20건 자동 fetch + 카드 목록 표시.
 *  - 카드 클릭 → 해당 PR URL 로 리뷰 시작.
 *  - "리뷰 시작" 버튼 / Enter → 부모 onStart 콜백 호출 (URL 문자열 그대로 전달).
 *  - 최근 리뷰 5건 표시 (재실행 편의).
 *  - 로딩 상태 (isReviewing) / 에러 (error) 표시.
 *  - 빈 입력 시 4가지 지원 URL 형식 hint.
 *
 * 단방향 데이터 흐름:
 *  - 입력 상태(useState)는 로컬, 리뷰 실행/결과는 부모(App.tsx)가 보유.
 *  - props.isReviewing 이 true→false 로 떨어질 때 최근 목록 다시 로드.
 *
 * 시스템 경계 검증:
 *  - URL 은 parsePRUrl / parseCommitUrl / parseCompareUrl / parseRepoUrl 로 검증 후에만 전달.
 *  - listPRs 응답은 githubClient.ts 의 toPRSummary 에서 unknown 검증.
 */
import { useEffect, useRef, useState, type FC } from 'react';

import {
  listPRs,
  parseCommitUrl,
  parseCompareUrl,
  parsePRUrl,
  parseRepoUrl,
  type PRSummary,
  type ParsedRepoUrl,
} from '../lib/githubClient';
import { getGithubToken, getRecentReviews, type RecentReview } from '../lib/storage';

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
  const [prList, setPrList] = useState<PRSummary[] | null>(null);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  // 동일 repo 에 대한 중복 fetch 방지 (useEffect debounce 보조).
  const lastFetchedRepoRef = useRef<string | null>(null);

  // 리뷰 종료(false 로 떨어지는 시점) 마다 최근 목록 갱신.
  useEffect(() => {
    setRecent(getRecentReviews());
  }, [isReviewing]);

  const trimmed = url.trim();
  // 우선순위: PR → commit → compare → repo. (commit 단축형 'owner/repo@sha' 가 repo 단축형보다 먼저)
  const prParsed = trimmed ? parsePRUrl(trimmed) : null;
  const commitParsed = !prParsed && trimmed ? parseCommitUrl(trimmed) : null;
  const compareParsed = !prParsed && !commitParsed && trimmed ? parseCompareUrl(trimmed) : null;
  const repoParsed: ParsedRepoUrl | null =
    !prParsed && !commitParsed && !compareParsed && trimmed ? parseRepoUrl(trimmed) : null;
  // PR/commit/compare 셋 중 하나면 즉시 분석 가능.
  const isAnalyzable = prParsed !== null || commitParsed !== null || compareParsed !== null;

  // Repo URL 감지 시 자동 fetch (debounce 350ms).
  useEffect(() => {
    if (repoParsed === null) {
      lastFetchedRepoRef.current = null;
      setPrList(null);
      setListError(null);
      return;
    }

    const key = `${repoParsed.owner}/${repoParsed.repo}`;
    if (key === lastFetchedRepoRef.current) return;

    const timer = window.setTimeout(() => {
      lastFetchedRepoRef.current = key;
      void fetchPRs(repoParsed);
    }, 350);

    return () => window.clearTimeout(timer);
    // 의도적으로 repoParsed 객체 동일성보다 owner/repo 문자열에 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoParsed?.owner, repoParsed?.repo]);

  const fetchPRs = async (parsed: ParsedRepoUrl): Promise<void> => {
    setLoadingPRs(true);
    setListError(null);
    try {
      const token = await getGithubToken();
      const prs = await listPRs(parsed.owner, parsed.repo, token ?? undefined, 'all', 20);
      setPrList(prs);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setPrList(null);
    } finally {
      setLoadingPRs(false);
    }
  };

  const handleStart = (): void => {
    if (!isAnalyzable || isReviewing) return;
    onStart(trimmed);
  };

  const handlePRClick = (pr: PRSummary): void => {
    if (isReviewing) return;
    setUrl(pr.html_url);
    setPrList(null);
    onStart(pr.html_url);
  };

  const handleRecentClick = (prUrl: string): void => {
    setUrl(prUrl);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-500 mb-2">코드 리뷰</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary leading-tight">
          GitHub PR · commit · compare · repo 링크
        </h2>
        <p className="mt-3 text-text-secondary">
          PR / commit / compare URL 또는 repo 링크를 붙여넣으세요. 약 3~5분 소요.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
        <label htmlFor="pr-url" className="block text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">
          URL
        </label>
        <input
          id="pr-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
          placeholder="https://github.com/owner/repo/pull/123 또는 /commit/abc 또는 /compare/main...feature"
          disabled={isReviewing}
          className="w-full rounded-md border border-border bg-surface-alt px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
        />

        {prParsed !== null && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ PR 감지: {prParsed.owner}/{prParsed.repo} #{prParsed.number}
          </p>
        )}

        {commitParsed !== null && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Commit 감지: {commitParsed.owner}/{commitParsed.repo}@{commitParsed.sha.slice(0, 7)}
          </p>
        )}

        {compareParsed !== null && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Compare 감지: {compareParsed.owner}/{compareParsed.repo} {compareParsed.base}...{compareParsed.head}
          </p>
        )}

        {repoParsed !== null && (
          <p className="mt-2 text-xs text-brand-600 dark:text-brand-100">
            📦 Repo 감지: {repoParsed.owner}/{repoParsed.repo}
            {loadingPRs ? ' — 최근 PR 가져오는 중…' : ' — 아래에서 PR 선택'}
          </p>
        )}

        {!trimmed && (
          <div className="mt-3 p-3 rounded-md bg-surface-alt text-xs text-text-secondary">
            <p className="font-semibold mb-1">💡 입력 가능한 URL 형식:</p>
            <ul className="space-y-1 ml-3">
              <li>• <code className="font-mono">github.com/owner/repo/pull/123</code> — 단일 PR</li>
              <li>• <code className="font-mono">github.com/owner/repo/commit/abc123</code> — 단일 커밋</li>
              <li>• <code className="font-mono">github.com/owner/repo/compare/main...feature</code> — 브랜치 비교</li>
              <li>• <code className="font-mono">github.com/owner/repo</code> — 최근 PR 목록 보기</li>
            </ul>
          </div>
        )}

        {error !== null && (
          <p role="alert" className="mt-3 text-sm text-severity-critical">
            {error}
          </p>
        )}

        {isAnalyzable && (
          <button
            type="button"
            onClick={handleStart}
            disabled={!isAnalyzable || isReviewing}
            className="mt-6 w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReviewing ? '리뷰 진행 중... (3~5분)' : '리뷰 시작'}
          </button>
        )}
      </section>

      {/* PR 목록 — repo URL 자동 감지 후 표시. */}
      {repoParsed !== null && prList !== null && prList.length > 0 && (
        <section className="mt-6" aria-label="repo PR 목록">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-3">
            {repoParsed.owner}/{repoParsed.repo} 최근 PR {prList.length}건
          </h3>
          <ul className="space-y-2">
            {prList.map((pr) => (
              <li key={pr.number}>
                <button
                  type="button"
                  onClick={() => handlePRClick(pr)}
                  disabled={isReviewing}
                  className="w-full text-left p-4 rounded-lg border border-border bg-surface hover:bg-surface-alt hover:border-brand-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <span className="text-sm font-bold text-text-primary truncate">{pr.title}</span>
                    <span className={getStateBadgeClass(pr)}>
                      {pr.merged ? 'MERGED' : pr.state.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    #{pr.number} · {pr.author || '익명'} · +{pr.additions}/-{pr.deletions} · {pr.changed_files}파일
                  </p>
                  <p className="text-xs text-text-secondary mt-1 truncate">
                    {pr.head_ref || '?'} → {pr.base_ref || '?'} · {formatDate(pr.updated_at)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {listError !== null && (
        <p role="alert" className="mt-3 text-sm text-severity-critical">
          PR 목록 가져오기 실패: {listError}
        </p>
      )}

      {repoParsed !== null && prList !== null && prList.length === 0 && !loadingPRs && (
        <p className="mt-6 text-sm text-text-muted">
          이 repo에 PR이 없습니다. PR을 만든 후 다시 시도하세요.
        </p>
      )}

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
                    {formatDate(r.date)} · CRITICAL {r.critical} · WARNING {r.warning} · SUGGESTION {r.suggestion}
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

/** PR 상태(open/closed/merged) 별 뱃지 색상 클래스. */
function getStateBadgeClass(pr: PRSummary): string {
  const base = 'shrink-0 text-xs font-bold px-2 py-0.5 rounded-full';
  if (pr.merged) {
    return `${base} bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200`;
  }
  if (pr.state === 'open') {
    return `${base} bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200`;
  }
  return `${base} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200`;
}

/** ISO date → ko-KR 표기. 빈 문자열이면 그대로. */
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ko-KR');
}

export default Input;
