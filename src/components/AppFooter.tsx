/**
 * AppFooter — 모든 일반 화면(input/reviewing/result/settings/about) 하단에 고정 표시.
 *
 * 책임:
 *  - 저작권 + 제작자 + 메일 링크 (Tauri webview 에서 mailto 직접 열기 불가 → openUrl 콜백).
 *  - 사이트(SiteFooter)와 동일한 마크업 패턴 — `max-w-5xl` 컨테이너 + `text-text-muted`.
 *
 * 정책:
 *  - Onboarding 화면에는 표시하지 않음 (App.tsx 의 early return 으로 자연 분기).
 *  - 외부 메일 링크는 plugin-opener.openUrl 로 OS 기본 메일 클라이언트에 위임 (About.tsx 동일 패턴).
 *  - 키보드 접근성: `focus-visible:ring` 으로 포커스 표시.
 */
import type { FC } from 'react';

import { openUrl } from '@tauri-apps/plugin-opener';

const EMAIL = 'ssallem@kakao.com';

const AppFooter: FC = () => {
  const year = new Date().getFullYear();

  const handleMailClick = async (): Promise<void> => {
    try {
      await openUrl(`mailto:${EMAIL}`);
    } catch (e) {
      console.error('openUrl(mailto) 실패:', e);
    }
  };

  return (
    <footer className="border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-text-muted">
          <p>© {year} FirstNode.</p>
          <p className="flex items-center gap-2">
            <span>Made by FirstNode</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => void handleMailClick()}
              className="text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
            >
              {EMAIL}
            </button>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
