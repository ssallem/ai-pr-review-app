/**
 * About — 앱 정보 + 후원 배지 + 라이선스/링크.
 *
 * 책임:
 *  - 앱 이름/버전/라이선스 배지.
 *  - SponsorBadges 임베드 (3채널 후원 진입점).
 *  - 외부 링크 (사이트 / GitHub / Issues).
 *  - 푸터: 제작자 표기.
 *
 * 정책:
 *  - 외부 링크는 plugin-opener.openUrl 로 OS 기본 브라우저에서 열림.
 *  - 이모지(🌐 📦 🐛)는 시각 라벨 — 글로벌 룰 예외.
 *  - 다크모드 대응 그라데이션 hero.
 */
import type { FC } from 'react';

import { openUrl } from '@tauri-apps/plugin-opener';

import SponsorBadges from './SponsorBadges';

interface Props {
  onClose: () => void;
}

const APP_VERSION = 'v1.0.0';
const SITE_URL = 'https://ai-review-kit.pages.dev';
const REPO_URL = 'https://github.com/ssallem/ai-pr-review-app';
const ISSUES_URL = 'https://github.com/ssallem/ai-pr-review-app/issues';

const About: FC<Props> = ({ onClose }) => {
  const open = async (url: string): Promise<void> => {
    try {
      await openUrl(url);
    } catch (e) {
      console.error('openUrl 실패:', e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="flex items-center justify-between mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary">정보</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
        >
          ← 돌아가기
        </button>
      </header>

      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-brand-50 via-surface to-violet-50 dark:from-brand-900/20 dark:via-surface dark:to-violet-900/20 p-6 sm:p-8 mb-6">
        <h1 className="text-3xl font-extrabold text-brand-500 dark:text-brand-100 mb-2">AI PR Review Toolkit</h1>
        <p className="text-text-secondary dark:text-text-primary mb-4">
          Claude로 한국어 PR 리뷰를 자동화하는 데스크톱 앱
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-100 font-bold">
            {APP_VERSION}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-100 font-bold">
            MIT License
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-alt text-text-secondary dark:text-slate-300 font-mono">
            Made by FirstNode
          </span>
        </div>
      </section>

      {/* 후원 */}
      <SponsorBadges />

      {/* 링크 */}
      <section className="mt-8 p-6 rounded-xl border border-border bg-surface">
        <h3 className="text-lg font-bold text-text-primary mb-3">링크</h3>
        <ul className="space-y-2 text-sm">
          <li>
            <button
              type="button"
              onClick={() => void open(SITE_URL)}
              className="text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
            >
              🌐 사이트 — ai-review-kit.pages.dev
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => void open(REPO_URL)}
              className="text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
            >
              📦 GitHub 저장소 — ssallem/ai-pr-review-app
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => void open(ISSUES_URL)}
              className="text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
            >
              🐛 버그·기능 제안 — Issues
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
};

export default About;
