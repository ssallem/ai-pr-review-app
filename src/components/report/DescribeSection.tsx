/**
 * DescribeSection — PR 설명 자동 생성 결과 표시.
 *
 * - 상단에 brand-500 원형 아이콘 + 헤더, brand 톤 그림자/2px 보더,
 *   라벨은 brand-700, 본문 line-height 1.8, 체인지로그 padding p-6.
 * - PR 제목 + 설명 + 체인지로그 3블록.
 * - 마크다운은 prop으로 받아 whitespace-pre-line/pre로 렌더 (라이브러리 무의존).
 *
 * 원본: web/src/components/report/DescribeSection.astro (Phase 1-D-Components 포팅).
 */

import type { FC } from 'react';

interface Props {
  prTitle: string;
  prDescription: string;
  changelog: string;
  title?: string;
}

// 섹션 라벨 공통 클래스 — brand 색으로 강조
const LABEL_CLASS =
  'text-xs sm:text-sm font-bold uppercase tracking-widest text-brand-700 dark:text-brand-100 mb-3';

const DescribeSection: FC<Props> = ({
  prTitle,
  prDescription,
  changelog,
  title = 'PR 설명 자동 생성',
}) => {
  return (
    <section className="my-8 p-6 sm:p-8 rounded-2xl bg-surface border-2 border-brand-500/20 shadow-sm">
      <header className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-500 text-white shadow-sm"
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h5.586A2 2 0 0113 2.586L15.414 5A2 2 0 0116 6.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h4a1 1 0 110 2H7a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight">
          {title}
        </h2>
      </header>

      <div className="space-y-8">
        <div>
          <h3 className={LABEL_CLASS}>PR 제목</h3>
          <code className="block p-4 sm:p-5 rounded-lg bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-700 font-mono text-base text-brand-900 dark:text-brand-100 font-medium leading-relaxed">
            {prTitle}
          </code>
        </div>

        <div>
          <h3 className={LABEL_CLASS}>설명</h3>
          <p
            className="text-base text-text-primary whitespace-pre-line"
            style={{ lineHeight: 1.8 }}
          >
            {prDescription}
          </p>
        </div>

        <div>
          <h3 className={LABEL_CLASS}>체인지로그</h3>
          <pre
            className="p-5 sm:p-6 rounded-lg bg-surface-alt border border-border font-mono text-sm sm:text-[15px] text-text-primary overflow-x-auto whitespace-pre"
            style={{ lineHeight: 1.6 }}
          >
            {changelog}
          </pre>
        </div>
      </div>
    </section>
  );
};

export default DescribeSection;
