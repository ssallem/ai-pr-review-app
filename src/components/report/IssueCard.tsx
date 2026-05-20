/**
 * IssueCard — 단일 이슈 카드. native `<details>` 사용, JS 없음.
 *
 * - severity별로 좌측 6px border + 옅은 severity 틴트 배경.
 * - location은 brand 색 monospace로 강조 (가독성).
 * - body는 인라인 마크다운(백틱 `code`, **strong**)을 HTML로 변환,
 *   나머지는 whitespace-pre-wrap. 코드 펜스(```)는 inline 변환에서 보호.
 * - 본문 line-height 1.8, p-5 padding, **strong** amber 하이라이트.
 *
 * 원본: web/src/components/report/IssueCard.astro (Phase 1-D-Components 포팅).
 */

import type { FC } from 'react';
import Badge from '../ui/Badge';
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

/**
 * HTML 이스케이프 후 인라인 마크다운 처리.
 *  - 백틱(`...`) → <code>
 *  - **strong** → <strong> + amber 하이라이트
 *
 * 코드 펜스(``` ... ```) 안쪽은 inline 변환에서 보호하기 위해 placeholder로 격리.
 * 백틱을 먼저 변환해 코드 안의 ** 가 strong으로 잘못 바뀌는 사고를 차단.
 * 시스템 경계 검증(골든 룰 6): dangerouslySetInnerHTML 이전에 모든 입력을 escape.
 */
function renderInlineFormatting(text: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 코드 펜스를 placeholder로 추출
  const fences: string[] = [];
  const fencePattern = /```[\s\S]*?```/g;
  const withFencePlaceholders = text.replace(fencePattern, (m) => {
    fences.push(m);
    return ` FENCE${fences.length - 1} `;
  });

  // 이스케이프
  const escaped = escape(withFencePlaceholders);

  // 1) 인라인 백틱 → <code> 의 HTML 자체를 다시 CODE placeholder로 격리 (strong 단계 보호)
  const codeBlocks: string[] = [];
  const withCodePlaceholders = escaped.replace(
    /`([^`\n]+)`/g,
    (_m, inner: string) => {
      const html =
        '<code class="rounded bg-surface-alt px-1.5 py-0.5 text-[0.92em] font-mono text-brand-700 dark:text-brand-100">' +
        inner +
        '</code>';
      codeBlocks.push(html);
      return ` CODE${codeBlocks.length - 1} `;
    },
  );

  // 2) **strong** → <strong> + amber 하이라이트
  const withStrong = withCodePlaceholders.replace(
    /\*\*([^*\n]+)\*\*/g,
    '<strong class="font-bold text-text-primary bg-amber-100/40 dark:bg-amber-900/30 px-1 rounded">$1</strong>',
  );

  // 3) CODE placeholder 복원
  const withCode = withStrong.replace(
    / CODE(\d+) /g,
    (_m, idx: string) => codeBlocks[Number(idx)] ?? '',
  );

  // 4) FENCE placeholder를 원래 펜스(이스케이프 후)로 복원
  return withCode.replace(/ FENCE(\d+) /g, (_m, idx: string) => {
    const original = fences[Number(idx)] ?? '';
    return escape(original);
  });
}

const IssueCard: FC<Props> = ({ id, severity, location, body, isOpen = false }) => {
  const variant = VARIANT_MAP[severity];
  const badgeColor = BADGE_COLOR_MAP[severity];
  const renderedBody = renderInlineFormatting(body);

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
        className="px-5 pb-5 text-[15px] text-text-primary whitespace-pre-wrap"
        style={{ lineHeight: 1.8 }}
        dangerouslySetInnerHTML={{ __html: renderedBody }}
      />
    </details>
  );
};

export default IssueCard;
