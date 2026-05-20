/**
 * Result — PR 리뷰 결과 화면.
 *
 * 책임:
 *  - Hero (PR 메타 + "새 리뷰" 버튼 + 토큰 사용량).
 *  - 한 줄 요약 (result.summary) 강조 카드.
 *  - 봇 자체 처리 경고 (result.warnings) — 절단/파싱 실패 등.
 *  - ReportSummary 통계 (CRITICAL/WARNING/SUGGESTION/소요시간).
 *  - IssueList severity 그룹 목록.
 *
 * 정책:
 *  - DescribeSection 은 Phase 2 (PR 설명 자동 생성) 진입 시 별도 화면에서 사용 →
 *    리뷰 결과 화면은 ReportSummary + IssueList 만 사용.
 *  - 이모지(🤖 등)는 UI 라벨로 의도된 시각 요소 — 글로벌 "이모지 금지" 룰 예외.
 */
import type { FC } from 'react';

import type { ReviewResult } from '../lib/reviewer';
import IssueList from './report/IssueList';
import ReportSummary from './report/ReportSummary';

interface Props {
  result: ReviewResult;
  /** DiffPayload.meta.title — 부모(App.tsx)가 reviewMeta state로 전달. */
  prTitle?: string;
  /** PR URL — 사용자가 클릭하지는 않고 표시 전용. */
  prUrl?: string;
  onNewReview: () => void;
}

const Result: FC<Props> = ({ result, prTitle, prUrl, onNewReview }) => {
  const criticalCount = result.issues.filter((i) => i.severity === 'CRITICAL').length;
  const warningCount = result.issues.filter((i) => i.severity === 'WARNING').length;
  const suggestionCount = result.issues.filter((i) => i.severity === 'SUGGESTION').length;
  const durationSec = Math.round(result.duration_ms / 1000);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Hero */}
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
        {prTitle !== undefined && prTitle !== '' && (
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary leading-tight mb-3">
            {prTitle}
          </h1>
        )}
        {prUrl !== undefined && prUrl !== '' && (
          <p className="text-sm text-text-secondary font-mono break-all">{prUrl}</p>
        )}
        <p className="mt-4 text-sm text-text-secondary">
          🤖 {result.usage.input_tokens.toLocaleString()} 입력 / {result.usage.output_tokens.toLocaleString()} 출력 토큰
        </p>
      </section>

      {/* 한 줄 요약 */}
      {result.summary !== '' && (
        <section className="my-8 rounded-xl border-l-4 border-brand-500 bg-brand-50 dark:bg-brand-900/20 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-brand-100 mb-2">
            한 줄 요약
          </p>
          <p className="text-base sm:text-lg text-text-primary leading-relaxed">{result.summary}</p>
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
    </div>
  );
};

export default Result;
