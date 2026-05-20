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
 *
 * Reviewing UX 개선:
 *  - reviewing 화면을 별도 Reviewing 컴포넌트로 분리 (Input 재사용 폐기).
 *  - handleStartReview 가 단계별 setReviewProgress 호출 (fetching/parsing/analyzing/finishing).
 *  - reviewMeta 를 diff fetch 직후 set — Reviewing 화면 상단에 repo/PR title 즉시 표시.
 */
import { useEffect, useState } from 'react';

import About from './components/About';
import AppHeader from './components/AppHeader';
import Input from './components/Input';
import Onboarding from './components/Onboarding';
import Result from './components/Result';
import Reviewing, { type ReviewProgress } from './components/Reviewing';
import Settings from './components/Settings';
import { checkClaudeCode, reviewDiffWithClaudeCode } from './lib/claudeCode';
import {
  loadCommitFromGitHub,
  loadCompareFromGitHub,
  loadPRFromGitHub,
  parseCommitUrl,
  parseCompareUrl,
  parsePRUrl,
  type DiffPayload,
} from './lib/githubClient';
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
  /** 'owner/repo' — reviewing 화면 상단 표시용. */
  repoName?: string;
}

export default function App() {
  // 부팅 직후엔 화면을 정하지 못함 → onboarding 가정 후 useEffect에서 결정.
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [isDark, setIsDark] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewMeta, setReviewMeta] = useState<ReviewMeta | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // 단계별 진행 상태 — Reviewing 화면이 단계 timeline 으로 표시.
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress>({
    stage: 'fetching',
    message: 'GitHub에 연결 중...',
  });

  // 첫 부팅: 다크모드 + 인증 모드 확인.
  // - authMode='claude-code': Claude Code CLI 가용성 체크 → 가능 시 input, 아니면 onboarding
  // - authMode='api': API 키 존재 시 input, 없으면 onboarding
  useEffect(() => {
    applyTheme(getSettings().theme); // <html>.dark 클래스 동기화.
    setIsDark(getEffectiveTheme() === 'dark');

    void (async () => {
      try {
        const settings = getSettings();
        if (settings.authMode === 'claude-code') {
          const cc = await checkClaudeCode();
          setScreen(cc.available ? 'input' : 'onboarding');
        } else {
          const key = await getApiKey();
          setScreen(key !== null && key !== '' ? 'input' : 'onboarding');
        }
      } catch {
        // 접근 실패 → 안전하게 onboarding 으로 fallback.
        setScreen('onboarding');
      }
    })();
  }, []);

  const handleOnboardingComplete = (): void => {
    setReviewError(null);
    setScreen('input');
  };

  const handleStartReview = async (inputUrl: string): Promise<void> => {
    // 4가지 형식 분기: PR / commit / compare / (그 외=거부).
    // repo URL 은 Input.tsx 에서 PR 목록을 보여줄 뿐 onStart 로 들어오지 않는다.
    const prParsed = parsePRUrl(inputUrl);
    const commitParsed = !prParsed ? parseCommitUrl(inputUrl) : null;
    const compareParsed = !prParsed && !commitParsed ? parseCompareUrl(inputUrl) : null;

    if (!prParsed && !commitParsed && !compareParsed) {
      setReviewError('유효한 GitHub PR / commit / compare URL이 아닙니다.');
      return;
    }

    setScreen('reviewing');
    setReviewError(null);
    setReviewProgress({ stage: 'fetching', message: 'GitHub에 연결 중...' });

    try {
      const settings = getSettings();

      // GitHub 토큰은 선택. 없으면 비인증 호출(rate limit 60/h).
      const githubToken = await getGithubToken();

      // diff 로드 분기 — 종류별 GitHub API endpoint.
      // 단계 1: fetching — 각 분기마다 진행 메시지 갱신.
      let diff: DiffPayload;
      let fallbackTitle: string;
      let owner: string;
      let repo: string;
      if (prParsed !== null) {
        setReviewProgress({
          stage: 'fetching',
          message: `PR #${prParsed.number} diff 다운로드 중`,
        });
        diff = await loadPRFromGitHub(prParsed, githubToken ?? undefined);
        fallbackTitle = `${prParsed.owner}/${prParsed.repo}#${prParsed.number}`;
        owner = prParsed.owner;
        repo = prParsed.repo;
      } else if (commitParsed !== null) {
        setReviewProgress({
          stage: 'fetching',
          message: `commit ${commitParsed.sha.slice(0, 7)} diff 다운로드 중`,
        });
        diff = await loadCommitFromGitHub(commitParsed, githubToken ?? undefined);
        fallbackTitle = `${commitParsed.owner}/${commitParsed.repo}@${commitParsed.sha.slice(0, 7)}`;
        owner = commitParsed.owner;
        repo = commitParsed.repo;
      } else if (compareParsed !== null) {
        setReviewProgress({
          stage: 'fetching',
          message: `${compareParsed.base}...${compareParsed.head} diff 다운로드 중`,
        });
        diff = await loadCompareFromGitHub(compareParsed, githubToken ?? undefined);
        fallbackTitle = `${compareParsed.owner}/${compareParsed.repo} ${compareParsed.base}...${compareParsed.head}`;
        owner = compareParsed.owner;
        repo = compareParsed.repo;
      } else {
        // 도달 불가 — 위에서 이미 거부됨. TS 좁히기용.
        throw new Error('어떤 URL 형식도 매치되지 않음 (내부 오류)');
      }

      const reviewTitle = diff.meta.title || fallbackTitle;

      // diff fetch 직후 reviewMeta 설정 — Reviewing 화면 상단에서 repo/PR title 표시.
      // 기존엔 Claude 호출 후 set 했지만, 그러면 분석 중인 동안 화면이 비어있음.
      setReviewMeta({
        prTitle: reviewTitle,
        prUrl: inputUrl,
        repoName: `${owner}/${repo}`,
      });

      // 단계 2: parsing — 파일 수 / LOC / 파일 목록 진행 상태에 추가.
      const totalLOC = diff.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
      const filenames = diff.files.map((f) => f.filename);
      setReviewProgress({
        stage: 'parsing',
        message: `파일 ${diff.files.length}개 · ${totalLOC.toLocaleString()} LOC 감지`,
        fileCount: diff.files.length,
        totalLOC,
        filenames,
      });

      // 단계 3: analyzing — 가장 오래 걸리는 단계 (3~5분).
      setReviewProgress({
        stage: 'analyzing',
        message: 'Claude가 한국어 리뷰 작성 중 (보통 3~5분)',
        fileCount: diff.files.length,
        totalLOC,
        filenames,
      });

      let result: ReviewResult;
      if (settings.authMode === 'claude-code') {
        // Max 모드 — subprocess 호출, API 키 불필요.
        result = await reviewDiffWithClaudeCode(diff);
      } else {
        const apiKey = await getApiKey();
        if (apiKey === null || apiKey === '') {
          setReviewError('API 키가 없습니다. 설정에서 등록해주세요.');
          setScreen('input');
          return;
        }
        result = await reviewDiff(diff, apiKey, { model: settings.model });
      }

      // 단계 4: finishing — 결과 저장 및 화면 전환 직전.
      setReviewProgress({
        stage: 'finishing',
        message: '결과 정리 중...',
        fileCount: diff.files.length,
        totalLOC,
      });

      setReviewResult(result);
      addRecentReview({
        id: crypto.randomUUID(),
        pr_url: inputUrl,
        pr_title: reviewTitle,
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
   * authMode='api' 인데 키가 사라졌으면 onboarding 으로 복귀.
   * authMode='claude-code' 면 API 키 유무와 무관 — 그대로 유지.
   */
  const handleApiKeyChanged = (): void => {
    void (async () => {
      const settings = getSettings();
      if (settings.authMode !== 'api') return;
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
          <Reviewing
            prTitle={reviewMeta?.prTitle}
            prUrl={reviewMeta?.prUrl}
            repoName={reviewMeta?.repoName}
            progress={reviewProgress}
          />
        )}
        {screen === 'result' && reviewResult !== null && (
          <Result
            result={reviewResult}
            prTitle={reviewMeta?.prTitle}
            prUrl={reviewMeta?.prUrl}
            repoName={reviewMeta?.repoName}
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
