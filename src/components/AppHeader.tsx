/**
 * 공통 상단 헤더 — Onboarding 외 모든 화면에서 사용.
 *
 * 책임:
 *  - 앱 타이틀 (좌측)
 *  - 다크모드 토글 / 정보 진입 / 설정 진입 (우측)
 *
 * 정책:
 *  - sticky + backdrop-blur 로 스크롤 시에도 가독성 유지.
 *  - 이모지(☀️ 🌙 ⚙️ ℹ️)는 UI 라벨로 의도된 시각 요소 — 글로벌 "이모지 금지" 룰 예외.
 *  - 접근성: focus-visible ring, aria-label, semantic <header>/<button>.
 */
import type { FC } from 'react';

interface Props {
  onSettingsClick: () => void;
  onAboutClick: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}

const AppHeader: FC<Props> = ({ onSettingsClick, onAboutClick, isDark, onToggleDark }) => {
  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-extrabold text-brand-500">
          AI PR Review Toolkit
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleDark}
            aria-label={isDark ? '라이트모드로 전환' : '다크모드로 전환'}
            className="p-2 rounded-md hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <button
            type="button"
            onClick={onAboutClick}
            aria-label="정보 열기"
            className="p-2 rounded-md hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            ℹ️
          </button>
          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="설정 열기"
            className="p-2 rounded-md hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            ⚙️
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
