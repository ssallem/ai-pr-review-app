/**
 * GithubAuthSection — Settings 안의 GitHub Device Flow OAuth 섹션.
 *
 * 책임:
 *   - "GitHub 계정으로 연결" 버튼 → startDeviceFlow + 브라우저 자동 열기.
 *   - 8자리 user_code 큰 글씨로 표시 + 남은 시간 카운트다운.
 *   - pollForToken 으로 백그라운드 폴링 + 성공 시 keychain 저장.
 *   - 사용자 취소(AbortController) + 연결 해제(deleteGithubToken).
 *
 * 시스템 경계:
 *   - access_token 은 storage.setGithubToken 안에서만 다룬다 — 컴포넌트 state로 보유 X.
 *   - 모든 에러는 한국어 alert role 로 사용자에게 표시.
 */
import { useEffect, useRef, useState, type FC } from 'react';

import { openUrl } from '@tauri-apps/plugin-opener';

import { pollForToken, startDeviceFlow, type DeviceFlowStart } from '../../lib/githubAuth';
import { deleteGithubToken, getGithubToken } from '../../lib/storage';

const GithubAuthSection: FC = () => {
  const [hasToken, setHasToken] = useState(false);
  const [flow, setFlow] = useState<DeviceFlowStart | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    void getGithubToken().then((t) => setHasToken(t !== null && t.length > 0));
  }, []);

  // 1초 카운트다운 타이머. flow 가 살아있는 동안만 동작.
  useEffect(() => {
    if (flow === null) return;
    tickRef.current = window.setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [flow]);

  // 컴포넌트 unmount 시 진행 중인 폴링은 중단.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleStartAuth = async (): Promise<void> => {
    setError(null);
    try {
      const f = await startDeviceFlow('repo');
      setFlow(f);
      setRemainingSec(f.expires_in);

      // 브라우저 자동 열기 (실패해도 진행 — 사용자가 수동으로 열 수 있음).
      try {
        await openUrl(f.verification_uri);
      } catch (e) {
        console.error('브라우저 자동 열기 실패:', e);
      }

      const abort = new AbortController();
      abortRef.current = abort;
      setPolling(true);

      await pollForToken(
        f,
        (_status, remaining) => {
          setRemainingSec(remaining);
        },
        abort.signal,
      );

      // 성공.
      setHasToken(true);
      setFlow(null);
      setPolling(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPolling(false);
      setFlow(null);
    }
  };

  const handleCancel = (): void => {
    abortRef.current?.abort();
    setFlow(null);
    setPolling(false);
  };

  const handleDisconnect = async (): Promise<void> => {
    if (!confirm('GitHub 연결을 해제하시겠습니까? 비공개 PR 접근이 제한됩니다.')) return;
    await deleteGithubToken();
    setHasToken(false);
  };

  const handleOpenVerification = async (): Promise<void> => {
    if (flow === null) return;
    try {
      await openUrl(flow.verification_uri);
    } catch (e) {
      console.error('브라우저 열기 실패:', e);
    }
  };

  return (
    <section className="mb-8 p-6 rounded-xl border border-border bg-surface">
      <h3 className="text-lg font-bold text-text-primary mb-2">GitHub 연결</h3>
      <p className="text-sm text-text-secondary mb-4">
        비공개 PR 접근 + rate limit 회피용. 한 번 연결하면 OS keychain에 저장됩니다. (PAT 발급 불필요)
      </p>

      {flow === null && !hasToken && (
        <button
          type="button"
          onClick={() => void handleStartAuth()}
          className="px-4 py-2 rounded-md bg-brand-500 text-white font-semibold hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          GitHub 계정으로 연결
        </button>
      )}

      {flow === null && hasToken && (
        <div className="space-y-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
            ✓ GitHub 연결됨
          </p>
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            className="px-4 py-2 rounded-md border border-severity-critical text-severity-critical hover:bg-red-50 dark:hover:bg-red-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            연결 해제
          </button>
        </div>
      )}

      {flow !== null && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-900/30 border-2 border-brand-300 dark:border-brand-700 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-brand-100 mb-2">
              브라우저에서 이 코드 입력
            </p>
            <p className="text-4xl font-extrabold font-mono text-brand-700 dark:text-brand-100 tracking-widest mb-3">
              {flow.user_code}
            </p>
            <p className="text-xs text-text-secondary">
              남은 시간: {formatTime(remainingSec)}
            </p>
          </div>

          <div className="text-sm text-text-primary leading-relaxed">
            <p>
              <strong>1.</strong> 브라우저가 자동으로 열렸어요. 안 열렸으면{' '}
              <button
                type="button"
                onClick={() => void handleOpenVerification()}
                className="text-brand-500 hover:underline"
              >
                여기 클릭
              </button>
            </p>
            <p>
              <strong>2.</strong> 위 8자리 코드 입력
            </p>
            <p>
              <strong>3.</strong> "Authorize ..." 클릭
            </p>
          </div>

          {polling && (
            <p className="text-sm text-text-secondary">
              인증 대기 중... ({formatTime(remainingSec)} 남음)
            </p>
          )}

          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-md border border-border text-text-secondary hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            취소
          </button>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-severity-critical">
          {error}
        </p>
      )}
    </section>
  );
};

/** 초 → "M:SS" 형식 변환. */
function formatTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default GithubAuthSection;
