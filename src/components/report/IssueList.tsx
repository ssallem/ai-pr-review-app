/**
 * IssueList — IssueCard 묶음 렌더러.
 *
 * - groupBy='severity' (기본): CRITICAL → WARNING → SUGGESTION 순으로 헤더+카드.
 *   0건 그룹은 숨김.
 * - groupBy='none': issues 배열 순서대로 평탄 렌더.
 * - 그룹 헤더는 severity 색 dot + 라벨 + 카운트 + 색상 라인으로 시각 위계 강화.
 * - WARNING은 기본 펼침, SUGGESTION은 기본 접힘.
 *
 * 원본: web/src/components/report/IssueList.astro (Phase 1-D-Components 포팅).
 */

import type { FC } from 'react';
import IssueCard from './IssueCard';
import type { ReviewIssue, Severity } from '../../lib/reviewer';

interface Props {
  issues: ReviewIssue[];
  groupBy?: 'severity' | 'none';
}

const GROUP_ORDER: Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'];

const GROUP_LABEL: Record<Severity, string> = {
  CRITICAL: 'CRITICAL',
  WARNING: 'WARNING',
  SUGGESTION: 'SUGGESTION',
};

interface GroupVariant {
  dot: string; // 헤더 dot 배경
  text: string; // 그룹 라벨 + 카운트 텍스트 색
  border: string; // 헤더 하단 라인 색 (severity 토큰은 투명도 적용 까다로워 Tailwind 고정색 사용)
}

const VARIANT_MAP: Record<Severity, GroupVariant> = {
  CRITICAL: {
    dot: 'bg-severity-critical',
    text: 'text-severity-critical',
    border: 'border-red-200 dark:border-red-900/40',
  },
  WARNING: {
    dot: 'bg-severity-warning',
    text: 'text-severity-warning',
    border: 'border-amber-200 dark:border-amber-900/40',
  },
  SUGGESTION: {
    dot: 'bg-severity-suggestion',
    text: 'text-severity-suggestion',
    border: 'border-sky-200 dark:border-sky-900/40',
  },
};

// severity별 기본 펼침 정책
const DEFAULT_OPEN: Record<Severity, boolean> = {
  CRITICAL: true,
  WARNING: true,
  SUGGESTION: false,
};

/**
 * ReviewIssue → IssueCard 가 쓰는 location 문자열 합성.
 *  - file 있으면 `file:line` 또는 `file`
 *  - 없으면 category 로 fallback (위치 미상 방지)
 */
function buildLocation(issue: ReviewIssue): string {
  if (issue.file) {
    return issue.line ? `${issue.file}:${issue.line}` : issue.file;
  }
  return issue.category;
}

/**
 * ReviewIssue → IssueCard id (DOM data-issue-id).
 *  - severity + index 조합으로 유일성 확보.
 */
function buildIssueId(issue: ReviewIssue, index: number): string {
  return `issue-${issue.severity.toLowerCase()}-${index}`;
}

/**
 * ReviewIssue → IssueCard body 마크다운.
 *  - message 본문 + (선택) suggested_fix 를 코드 펜스로 첨부.
 */
function buildBody(issue: ReviewIssue): string {
  if (!issue.suggested_fix) return issue.message;
  return `${issue.message}\n\n**제안 수정**\n\`\`\`\n${issue.suggested_fix}\n\`\`\``;
}

const IssueList: FC<Props> = ({ issues, groupBy = 'severity' }) => {
  if (groupBy === 'none') {
    return (
      <div className="my-8">
        {issues.map((issue, idx) => (
          <IssueCard
            key={buildIssueId(issue, idx)}
            id={buildIssueId(issue, idx)}
            severity={issue.severity}
            location={buildLocation(issue)}
            body={buildBody(issue)}
            isOpen={DEFAULT_OPEN[issue.severity]}
          />
        ))}
      </div>
    );
  }

  // severity 그룹핑 — 원본 순서를 보존하기 위해 index 를 함께 들고 묶음
  const grouped: Record<Severity, Array<{ issue: ReviewIssue; index: number }>> = {
    CRITICAL: [],
    WARNING: [],
    SUGGESTION: [],
  };
  issues.forEach((issue, index) => {
    grouped[issue.severity].push({ issue, index });
  });

  return (
    <div className="my-8">
      {GROUP_ORDER.map((severity) => {
        const list = grouped[severity];
        if (list.length === 0) return null;
        const v = VARIANT_MAP[severity];
        return (
          <section className="mt-10" key={severity} data-issue-group={severity}>
            <header className={`flex items-center gap-3 mb-5 pb-3 border-b-2 ${v.border}`}>
              <span
                className={`inline-block w-3 h-3 rounded-full ${v.dot}`}
                aria-hidden="true"
              />
              <h3 className={`text-xl sm:text-2xl font-extrabold tracking-tight ${v.text}`}>
                {GROUP_LABEL[severity]}
              </h3>
              <span className={`ml-auto text-2xl font-extrabold ${v.text}`}>
                {list.length}
              </span>
              <span className="text-sm font-bold uppercase tracking-wide text-text-muted">
                건
              </span>
            </header>
            {list.map(({ issue, index }) => (
              <IssueCard
                key={buildIssueId(issue, index)}
                id={buildIssueId(issue, index)}
                severity={issue.severity}
                location={buildLocation(issue)}
                body={buildBody(issue)}
                isOpen={DEFAULT_OPEN[severity]}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
};

export default IssueList;
