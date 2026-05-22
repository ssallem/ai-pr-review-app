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
import { useEffect, useRef, useState, type FC, type MouseEvent } from 'react';

import {
  listPRs,
  listRecentCommits,
  parseCommitUrl,
  parseCompareUrl,
  parsePRUrl,
  parseRepoUrl,
  type CommitSummary,
  type PRSummary,
  type ParsedRepoUrl,
} from '../lib/githubClient';
import {
  getCachedReviewIds,
  getGithubToken,
  getRecentReviews,
  type RecentReview,
} from '../lib/storage';

interface Props {
  /** 사용자가 "리뷰 시작" 누르면 호출. 부모가 실제 fetch + reviewDiff 실행. */
  onStart: (prUrl: string) => void;
  /** 리뷰 진행 중이면 input/버튼 비활성. */
  isReviewing: boolean;
  /** 부모가 발생시킨 에러 메시지. */
  error: string | null;
  /**
   * Settings 화면으로 이동. 404/403 (private repo or 권한 부족) 에러 발생 시
   * "Settings 열기 →" CTA 에서 호출.
   */
  onOpenSettings: () => void;
  /**
   * "최근 리뷰" 항목 클릭 시 호출. App.tsx 가 캐시 hit/miss 분기:
   *  - hit: Result 화면 직진입 (Claude 재호출 없음)
   *  - miss: 자동으로 handleStartReview 흐름
   */
  onRecentSelect: (id: string, prUrl: string) => void;
}

const Input: FC<Props> = ({ onStart, isReviewing, error, onOpenSettings, onRecentSelect }) => {
  const [url, setUrl] = useState('');
  const [recent, setRecent] = useState<RecentReview[]>([]);
  // 캐시 보유 id Set — "캐시됨" 배지 표시 + 즉시 진입 가능 여부 판정.
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [prList, setPrList] = useState<PRSummary[] | null>(null);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  // PR 0건 fallback — 1인 개발자(본인 repo에 PR 안 만듦) 워크플로우 지원.
  const [commitList, setCommitList] = useState<CommitSummary[] | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(false);
  // 동일 repo 에 대한 중복 fetch 방지 (useEffect debounce 보조).
  const lastFetchedRepoRef = useRef<string | null>(null);

  // 리뷰 종료(false 로 떨어지는 시점) 마다 최근 목록 + 캐시 id 갱신.
  useEffect(() => {
    setRecent(getRecentReviews());
    setCachedIds(new Set(getCachedReviewIds()));
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
      setCommitList(null);
      setListError(null);
      return;
    }

    const key = `${repoParsed.owner}/${repoParsed.repo}`;
    if (key === lastFetchedRepoRef.current) return;

    const timer = window.setTimeout(() => {
      lastFetchedRepoRef.current = key;
      // 새 repo → commit fallback 상태 초기화 (다음 effect 가 PR 0건 감지 시 재로드).
      setCommitList(null);
      void fetchPRs(repoParsed);
    }, 350);

    return () => window.clearTimeout(timer);
    // 의도적으로 repoParsed 객체 동일성보다 owner/repo 문자열에 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoParsed?.owner, repoParsed?.repo]);

  // PR 0건 감지 시 자동으로 최근 commit 10건 fetch — 1인 개발자 워크플로우 fallback.
  useEffect(() => {
    if (
      repoParsed !== null &&
      prList !== null &&
      prList.length === 0 &&
      commitList === null &&
      !loadingCommits
    ) {
      void fetchCommits(repoParsed);
    }
    // 의도적으로 repoParsed 객체 동일성보다 owner/repo 문자열에 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prList, repoParsed?.owner, repoParsed?.repo]);

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

  const fetchCommits = async (parsed: ParsedRepoUrl): Promise<void> => {
    setLoadingCommits(true);
    setListError(null);
    try {
      const token = await getGithubToken();
      const commits = await listRecentCommits(
        parsed.owner,
        parsed.repo,
        token ?? undefined,
        10,
      );
      setCommitList(commits);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setCommitList(null);
    } finally {
      setLoadingCommits(false);
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

  const handleCommitClick = (commit: CommitSummary): void => {
    if (isReviewing) return;
    setUrl(commit.html_url);
    setCommitList(null);
    setPrList(null);
    onStart(commit.html_url);
  };

  /**
   * "최근 리뷰" 항목 클릭. 캐시 hit/miss 분기는 App.tsx 의 onRecentSelect 가 처리.
   * 여기선 단순히 id + URL 만 전달.
   */
  const handleRecentClick = (id: string, prUrl: string): void => {
    if (isReviewing) return;
    onRecentSelect(id, prUrl);
  };

  /**
   * "↻ 다시 분석" 버튼. 캐시를 무시하고 새로 Claude 호출.
   * 카드 클릭 이벤트로 버블링되지 않도록 stopPropagation.
   */
  const handleReanalyze = (e: MouseEvent<HTMLButtonElement>, prUrl: string): void => {
    e.stopPropagation();
    if (isReviewing) return;
    setUrl(prUrl);
    onStart(prUrl);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-500 dark:text-brand-100 mb-2">코드 리뷰</p>
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

        {needsAuthCta(error) && (
          <AuthCta onOpenSettings={onOpenSettings} />
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

      {needsAuthCta(listError) && (
        <AuthCta onOpenSettings={onOpenSettings} />
      )}

      {/* PR 0건 fallback — 최근 commit 카드로 대체 (1인 개발자 워크플로우). */}
      {repoParsed !== null && prList !== null && prList.length === 0 && (
        <section className="mt-6" aria-label="repo 최근 커밋 fallback">
          <div className="mb-4 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 text-sm text-text-primary">
            💡 이 repo에 PR이 없어요. <strong>최근 커밋으로 대신 리뷰</strong>하실 수 있습니다.
          </div>

          {loadingCommits && (
            <p className="text-sm text-text-secondary">최근 커밋 가져오는 중...</p>
          )}

          {commitList !== null && commitList.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-3">
                {repoParsed.owner}/{repoParsed.repo} 최근 커밋 {commitList.length}건
              </h3>
              <ul className="space-y-2">
                {commitList.map((commit) => (
                  <li key={commit.sha}>
                    <button
                      type="button"
                      onClick={() => handleCommitClick(commit)}
                      disabled={isReviewing}
                      className="w-full text-left p-4 rounded-lg border border-border bg-surface hover:bg-surface-alt hover:border-brand-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <span className="text-sm font-bold text-text-primary truncate">{commit.message}</span>
                        <span className="shrink-0 text-xs font-mono text-text-muted">{commit.short_sha}</span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        {commit.author} · {formatDate(commit.date)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {commitList !== null && commitList.length === 0 && !loadingCommits && (
            <p className="text-sm text-text-muted">최근 커밋도 0건입니다. 빈 repo로 보입니다.</p>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-8" aria-label="최근 리뷰 기록">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted dark:text-text-secondary mb-3">
            최근 리뷰 <span className="font-normal normal-case tracking-normal text-text-muted dark:text-text-secondary">(최근 {recent.length}건)</span>
          </h3>
          <ul className="space-y-2">
            {recent.map((r) => {
              const hasCache = cachedIds.has(r.id);
              return (
                <li key={r.id}>
                  <div className="group relative w-full rounded-md border border-border bg-surface hover:bg-surface-alt transition focus-within:ring-2 focus-within:ring-brand-500">
                    <button
                      type="button"
                      onClick={() => handleRecentClick(r.id, r.pr_url)}
                      disabled={isReviewing}
                      className="w-full text-left p-3 pr-28 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={hasCache ? `${r.pr_title} (캐시됨 · 즉시 보기)` : `${r.pr_title} (다시 분석)`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{r.pr_title}</p>
                        {hasCache && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100">
                            ✓ 캐시됨
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted dark:text-text-secondary mt-1 font-mono truncate">{r.pr_url}</p>
                      <p className="text-xs text-text-secondary mt-1">
                        {formatDate(r.date)} · CRITICAL {r.critical} · WARNING {r.warning} · SUGGESTION {r.suggestion}
                      </p>
                    </button>
                    {hasCache && (
                      <button
                        type="button"
                        onClick={(e) => handleReanalyze(e, r.pr_url)}
                        disabled={isReviewing}
                        title="캐시를 무시하고 Claude를 다시 호출합니다 (3~5분)"
                        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-text-secondary hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 dark:hover:text-brand-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↻ 다시 분석
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">
            ✓ 캐시됨 = 로컬 PC 에 저장된 결과로 즉시 표시 (Claude 재호출 없음). 새 분석은 ↻ 버튼.
            <br />
            공유 PC 라면 결과가 다음 사용자에게 노출될 수 있으니 사용 후 Settings 에서 캐시 지우기를 사용하세요.
          </p>
        </section>
      )}
    </div>
  );
};

/**
 * 에러 메시지가 GitHub 인증 부족(404 private repo / 403 권한)을 시사하는지 판정.
 * githubClient.throwIfBad 의 메시지 패턴에 맞춘다.
 */
function needsAuthCta(msg: string | null): boolean {
  if (msg === null) return false;
  return /\b404\b|\b403\b|Forbidden|Invalid token|SAML SSO/.test(msg);
}

/** 인증 안내 인라인 CTA. Settings 화면으로 이동시킨다. */
const AuthCta: FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => (
  <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-100">
    <p className="font-semibold mb-2">private 저장소이거나 인증이 필요한 PR인가요?</p>
    <p className="mb-3">
      Settings 에서 GitHub 계정을 연결하면 private repo 에 접근할 수 있고, rate limit 도 회피됩니다.
    </p>
    <button
      type="button"
      onClick={onOpenSettings}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      Settings 열기 →
    </button>
  </div>
);

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
