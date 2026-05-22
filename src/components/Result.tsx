/**
 * Result — PR 리뷰 결과 화면.
 *
 * 책임:
 *  - Hero (📦 repo 배지 + PR 제목 + URL + "새 리뷰" 버튼 + 토큰 사용량).
 *  - 한 줄 요약 (result.summary) 강조 카드.
 *  - 봇 자체 처리 경고 (result.warnings) — 절단/파싱 실패 등.
 *  - ReportSummary 통계 (CRITICAL/WARNING/SUGGESTION/소요시간).
 *  - IssueList severity 그룹 목록.
 *  - AIPromptSection — Claude Code/Codex/일반 AI 용 수정 요청 프롬프트 + 복사 버튼.
 *
 * 변경 이력:
 *  - 2026-05: Hero 에 repoName 배지 추가 — "어떤 프로젝트인지 한눈에" UX 강화.
 *  - 2026-05: AIPromptSection 통합 — 결과를 그대로 본인 PC AI 도구에 넘길 수 있음.
 *
 * 정책:
 *  - DescribeSection 은 Phase 2 (PR 설명 자동 생성) 진입 시 별도 화면에서 사용 →
 *    리뷰 결과 화면은 ReportSummary + IssueList + AIPromptSection 만 사용.
 *  - 이모지(🤖 📦 🔗 등)는 UI 라벨로 의도된 시각 요소 — 글로벌 "이모지 금지" 룰 예외.
 */
import type { FC } from 'react';

import type { ReviewResult } from '../lib/reviewer';
import AIPromptSection from './report/AIPromptSection';
import IssueList from './report/IssueList';
import ReportSummary from './report/ReportSummary';

interface Props {
  result: ReviewResult;
  /** DiffPayload.meta.title — 부모(App.tsx)가 reviewMeta state로 전달. */
  prTitle?: string;
  /** PR URL — Hero 에 표시 + AI 프롬프트 컨텍스트로 전달. */
  prUrl?: string;
  /** 'owner/repo' — Hero 배지 + AI 프롬프트 컨텍스트로 전달. */
  repoName?: string;
  /** 최근 리뷰 캐시 hit 으로 복원된 결과인지 — Hero 배지 표시 여부. */
  isCached?: boolean;
  /** 캐시된 결과의 원분석 일자 (ko-KR 포맷). 예: "2026. 5. 22.". */
  cachedDate?: string;
  onNewReview: () => void;
}

const Result: FC<Props> = ({
  result,
  prTitle,
  prUrl,
  repoName,
  isCached,
  cachedDate,
  onNewReview,
}) => {
  const criticalCount = result.issues.filter((i) => i.severity === 'CRITICAL').length;
  const warningCount = result.issues.filter((i) => i.severity === 'WARNING').length;
  const suggestionCount = result.issues.filter((i) => i.severity === 'SUGGESTION').length;
  const durationSec = Math.round(result.duration_ms / 1000);

  const hasRepo = repoName !== undefined && repoName !== '';
  const hasTitle = prTitle !== undefined && prTitle !== '';
  const hasUrl = prUrl !== undefined && prUrl !== '';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Hero — 프로젝트명·제목·URL 강조 */}
      <section className="my-8 rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-alt p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500">PR 리뷰 결과</p>
          <button
            type="button"
            onClick={onNewReview}
            className="text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
          >
            새 리뷰 시작 →
          </button>
        </div>

        {/* 프로젝트명 배지 — "어떤 프로젝트를 의뢰했는지" 즉시 인식 */}
        {(hasRepo || isCached) && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            {hasRepo && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-100 text-sm font-mono font-semibold">
                <span aria-hidden="true">📦</span>
                {repoName}
              </span>
            )}
            {isCached === true && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-100 text-xs font-semibold">
                ✓ 캐시됨{cachedDate !== undefined && cachedDate !== '' ? ` · ${cachedDate} 분석` : ''}
              </span>
            )}
          </div>
        )}

        {/* PR 제목 */}
        {hasTitle && (
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary leading-tight mb-3">
            {prTitle}
          </h1>
        )}

        {/* PR URL — 클릭 시 OS 기본 브라우저로 (Tauri 외부 링크 정책 그대로) */}
        {hasUrl && (
          <p className="text-xs font-mono text-text-muted dark:text-text-secondary break-all">
            <span aria-hidden="true">🔗 </span>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-500 hover:underline"
            >
              {prUrl}
            </a>
          </p>
        )}

        {(() => {
          // prompt caching 사용 시 input_tokens 는 "캐시 미적중" 부분만 카운트되어
          // 거의 0 이 될 수 있다. 실제 비용·소모와 일치시키려면 cache_read + cache_creation 을
          // 합산해 표시해야 한다. (Anthropic Messages API 응답 형태 기준.)
          const u = result.usage;
          const cacheRead = u.cache_read_input_tokens ?? 0;
          const cacheCreate = u.cache_creation_input_tokens ?? 0;
          const totalInput = (u.input_tokens ?? 0) + cacheRead + cacheCreate;
          const hasCache = cacheRead > 0 || cacheCreate > 0;
          return (
            <p className="mt-4 text-sm text-text-secondary">
              🤖 {totalInput.toLocaleString()} 입력 /{' '}
              {(u.output_tokens ?? 0).toLocaleString()} 출력 토큰
              {hasCache && (
                <span className="ml-2 text-text-muted dark:text-text-secondary">
                  (캐시 적중 {cacheRead.toLocaleString()} · 캐시 생성 {cacheCreate.toLocaleString()})
                </span>
              )}
            </p>
          );
        })()}
      </section>

      {/* 한 줄 요약 */}
      {result.summary !== '' && (
        <section className="my-8 rounded-xl border-l-4 border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-slate-800 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-brand-100 mb-2">
            한 줄 요약
          </p>
          <p className="text-base sm:text-lg leading-relaxed text-slate-900 dark:text-slate-100">{result.summary}</p>
        </section>
      )}

      {/* 봇 자체 처리 안내 */}
      {result.warnings.length > 0 && (
        <section className="my-6 rounded-xl border-l-4 border-severity-warning bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-200 mb-2">
            처리 안내
          </p>
          <ul className="space-y-1 text-sm text-text-primary">
            {result.warnings.map((w, idx) => (
              <li key={idx}>· {w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 통계 */}
      <ReportSummary
        critical={criticalCount}
        warning={warningCount}
        suggestion={suggestionCount}
        duration_sec={durationSec}
      />

      {/* 이슈 목록 */}
      <IssueList issues={result.issues} groupBy="severity" />

      {/* AI 수정 요청 프롬프트 — 이슈가 있을 때만 */}
      {result.issues.length > 0 && (
        <AIPromptSection
          result={result}
          prTitle={prTitle}
          repoName={repoName}
          prUrl={prUrl}
        />
      )}
    </div>
  );
};

export default Result;
