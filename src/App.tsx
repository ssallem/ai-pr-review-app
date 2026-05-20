/**
 * 앱 루트 — Phase 1-D-Screens-2.
 *
 * 상태 머신:
 *   onboarding → input ⇄ reviewing → result
 *                   ↑                    ↓
 *                   └─── (새 리뷰) ──────┘
 *                   ⇄ settings / about
 *
 * 책임:
 *  - 첫 부팅 시 API 키 유무로 onboarding/input 라우팅.
 *  - 다크모드 toggle / 설정·정보 진입.
 *  - 리뷰 실행: loadPRFromGitHub → reviewDiff → addRecentReview → result.
 *  - Result 에 PR 메타(title/url) 를 전달하기 위해 reviewMeta state 유지.
 *
 * Phase 1-D-Screens-2 변경:
 *  - Result/Settings placeholder 제거 → 실제 컴포넌트 (Result, Settings) 사용.
 *  - About 화면 추가 + AppHeader 에 정보 버튼 신설.
 *  - Settings 에서 API 키 삭제 시 onApiKeyChanged 콜백으로 onboarding 으로 복귀.
 */
import { useEffect, useState } from 'react';

import About from './components/About';
import AppHeader from './components/AppHeader';
import Input from './components/Input';
import Onboarding from './components/Onboarding';
import Result from './components/Result';
import Settings from './components/Settings';
import { loadPRFromGitHub, parsePRUrl } from './lib/githubClient';
import { reviewDiff, type ReviewResult } from './lib/reviewer';
import {
  addRecentReview,
  applyTheme,
  getApiKey,
  getEffectiveTheme,
  getGithubToken,
  getSettings,
} from './lib/storage';
import './styles/global.css';

type Screen = 'onboarding' | 'input' | 'reviewing' | 'result' | 'settings' | 'about';

interface ReviewMeta {
  prTitle: string;
  prUrl: string;
}

export default function App() {
  // 부팅 직후엔 화면을 정하지 못함 → onboarding 가정 후 useEffect에서 결정.
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [isDark, setIsDark] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewMeta, setReviewMeta] = useState<ReviewMeta | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // 첫 부팅: 다크모드 + API 키 확인.
  useEffect(() => {
    applyTheme(getSettings().theme); // <html>.dark 클래스 동기화.
    setIsDark(getEffectiveTheme() === 'dark');

    void (async () => {
      try {
        const key = await getApiKey();
        setScreen(key !== null && key !== '' ? 'input' : 'onboarding');
      } catch {
        // keychain 접근 실패 → 안전하게 onboarding 으로 fallback.
        setScreen('onboarding');
      }
    })();
  }, []);

  const handleOnboardingComplete = (): void => {
    setReviewError(null);
    setScreen('input');
  };

  const handleStartReview = async (prUrl: string): Promise<void> => {
    const parsed = parsePRUrl(prUrl);
    if (parsed === null) {
      setReviewError('유효하지 않은 PR URL입니다.');
      return;
    }

    setScreen('reviewing');
    setReviewError(null);

    try {
      const apiKey = await getApiKey();
      if (apiKey === null || apiKey === '') {
        setReviewError('API 키가 없습니다. 설정에서 등록해주세요.');
        setScreen('input');
        return;
      }

      // GitHub 토큰은 선택. 없으면 비인증 호출(rate limit 60/h).
      const githubToken = await getGithubToken();
      const diff = await loadPRFromGitHub(parsed, githubToken ?? undefined);
      const result = await reviewDiff(diff, apiKey, { model: getSettings().model });

      const prTitle = diff.meta.title || `${parsed.owner}/${parsed.repo}#${parsed.number}`;
      setReviewResult(result);
      setReviewMeta({ prTitle, prUrl });
      addRecentReview({
        id: crypto.randomUUID(),
        pr_url: prUrl,
        pr_title: prTitle,
        date: new Date().toISOString(),
        critical: result.issues.filter((i) => i.severity === 'CRITICAL').length,
        warning: result.issues.filter((i) => i.severity === 'WARNING').length,
        suggestion: result.issues.filter((i) => i.severity === 'SUGGESTION').length,
        duration_sec: Math.round(result.duration_ms / 1000),
      });
      setScreen('result');
    } catch (e) {
      setReviewError(`리뷰 실패: ${e instanceof Error ? e.message : String(e)}`);
      setScreen('input');
    }
  };

  const handleToggleDark = (): void => {
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    setIsDark(!isDark);
  };

  const handleNewReview = (): void => {
    setReviewResult(null);
    setReviewMeta(null);
    setReviewError(null);
    setScreen('input');
  };

  /**
   * Settings 에서 API 키 변경/삭제 시 호출.
   * 키가 사라졌으면 onboarding 으로 복귀, 그 외엔 input 으로.
   */
  const handleApiKeyChanged = (): void => {
    void (async () => {
      try {
        const key = await getApiKey();
        if (key === null || key === '') {
          setScreen('onboarding');
        }
      } catch {
        setScreen('onboarding');
      }
    })();
  };

  // Onboarding 화면은 헤더 없이 단독.
  if (screen === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // 공통 헤더 + 본문 라우팅.
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <AppHeader
        onSettingsClick={() => setScreen('settings')}
        onAboutClick={() => setScreen('about')}
        isDark={isDark}
        onToggleDark={handleToggleDark}
      />
      <main>
        {screen === 'input' && (
          <Input
            onStart={(url) => void handleStartReview(url)}
            isReviewing={false}
            error={reviewError}
          />
        )}
        {screen === 'reviewing' && (
          <Input
            onStart={(url) => void handleStartReview(url)}
            isReviewing={true}
            error={null}
          />
        )}
        {screen === 'result' && reviewResult !== null && (
          <Result
            result={reviewResult}
            prTitle={reviewMeta?.prTitle}
            prUrl={reviewMeta?.prUrl}
            onNewReview={handleNewReview}
          />
        )}
        {screen === 'settings' && (
          <Settings
            onClose={() => setScreen('input')}
            onApiKeyChanged={handleApiKeyChanged}
          />
        )}
        {screen === 'about' && <About onClose={() => setScreen('input')} />}
      </main>
    </div>
  );
}
