/**
 * IssueCard — 단일 이슈 카드. native `<details>` 사용, JS 없음.
 *
 * - severity별로 좌측 6px border + 옅은 severity 틴트 배경.
 * - location은 brand 색 monospace로 강조 (가독성).
 * - body는 marked 라이브러리로 GFM 마크다운 렌더 — 코드 펜스(```) 포함.
 * - 본문 line-height 1.8, p-5 padding, **strong** amber 하이라이트.
 *
 * 변경 이력:
 *  - 2026-05: renderInlineFormatting → src/lib/markdown.ts 의 renderMarkdown 으로 교체.
 *    이유: 멀티라인 코드 펜스 미렌더링 버그 — 자체 파서가 fence 를 placeholder 로
 *    복원하기만 하고 <pre><code> 로 감싸지 않았음.
 */

import type { FC } from 'react';
import Badge from '../ui/Badge';
import { renderMarkdown } from '../../lib/markdown';
import type { Severity } from '../../lib/reviewer';

interface Props {
  id: string;
  severity: Severity;
  location: string;
  body: string;
  isOpen?: boolean;
}

interface CardVariant {
  border: string; // 좌측 6px border 색
  tint: string; // 옅은 배경 틴트 (라이트/다크)
}

const VARIANT_MAP: Record<Severity, CardVariant> = {
  CRITICAL: {
    border: 'border-l-severity-critical',
    tint: 'bg-red-50/40 dark:bg-red-900/10',
  },
  WARNING: {
    border: 'border-l-severity-warning',
    tint: 'bg-amber-50/40 dark:bg-amber-900/10',
  },
  SUGGESTION: {
    border: 'border-l-severity-suggestion',
    tint: 'bg-sky-50/40 dark:bg-sky-900/10',
  },
};

const BADGE_COLOR_MAP: Record<Severity, 'red' | 'amber' | 'sky'> = {
  CRITICAL: 'red',
  WARNING: 'amber',
  SUGGESTION: 'sky',
};

const IssueCard: FC<Props> = ({ id, severity, location, body, isOpen = false }) => {
  const variant = VARIANT_MAP[severity];
  const badgeColor = BADGE_COLOR_MAP[severity];
  // marked 출력은 자체 escape + 우리 renderer 에서 추가 escape — XSS 1차 차단.
  const renderedBody = renderMarkdown(body);

  return (
    <details
      className={`group rounded-lg border border-border border-l-[6px] ${variant.border} ${variant.tint} my-3 transition hover:shadow-md open:shadow-sm`}
      data-issue-id={id}
      data-issue-severity={severity}
      open={isOpen}
    >
      <summary className="flex items-start gap-3 cursor-pointer list-none p-5 rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 hover:bg-surface-alt/40">
        <Badge color={badgeColor} size="md">
          {severity}
        </Badge>
        <code className="flex-1 min-w-0 break-all font-mono text-sm font-medium leading-tight pt-1 text-brand-700 dark:text-brand-100">
          {location || '(위치 미상)'}
        </code>
        <svg
          className="w-5 h-5 shrink-0 mt-1 text-text-muted transition-transform group-open:rotate-180"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div
        className="markdown-body px-5 pb-5 text-[15px]"
        dangerouslySetInnerHTML={{ __html: renderedBody }}
      />
    </details>
  );
};

export default IssueCard;
