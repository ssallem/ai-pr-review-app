/**
 * 첫 부팅 화면 — Anthropic API 키 등록.
 *
 * 흐름:
 *  1. 사용자가 sk-ant-... 키 입력
 *  2. 클라이언트 측 기초 검증 (prefix + 길이)
 *  3. storage.setApiKey() → OS keychain 저장
 *  4. onComplete 콜백 → 부모(App.tsx)에서 메인 화면으로 라우팅
 *
 * 보안:
 *  - input type="password" 로 화면 노출 차단.
 *  - 키는 메모리 상태(useState)에만 존재 → 저장 직후 컴포넌트 unmount 시 GC.
 *  - 절대 localStorage / console.log 금지.
 *
 * 시스템 경계 검증 (golden rule #6):
 *  - 사용자 입력은 신뢰 불가 → prefix + 길이 검증 후 storage 호출.
 */
import { useState, type FC } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { setApiKey } from '../lib/storage';

interface Props {
  /** 키 저장 완료 시 호출 — 부모는 메인 화면으로 라우팅. */
  onComplete: () => void;
}

const API_KEYS_URL = 'https://console.anthropic.com/settings/keys';

const Onboarding: FC<Props> = ({ onComplete }) => {
  const [apiKey, setApiKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidKey = apiKey.startsWith('sk-ant-') && apiKey.length > 20;

  const handleSave = async (): Promise<void> => {
    if (!isValidKey) {
      setError('Anthropic API 키는 "sk-ant-"로 시작해야 합니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setApiKey(apiKey);
      onComplete();
    } catch (e) {
      setError(`키 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const openApiKeysPage = async (): Promise<void> => {
    try {
      await openUrl(API_KEYS_URL);
    } catch (e) {
      // 브라우저 열기 실패는 치명적 이슈 아님 — 사용자에게 URL 직접 안내.
      setError(`브라우저 열기 실패. 직접 방문: ${API_KEYS_URL}`);
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface text-text-primary">
      <div className="w-full max-w-lg">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-500 mb-3">
            AI PR Review Toolkit
          </h1>
          <p className="text-text-secondary text-lg">
            Claude로 한국어 PR 리뷰를 시작해보세요
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-bold text-text-primary mb-2">Anthropic API 키 등록</h2>
          <p className="text-sm text-text-secondary mb-5 leading-relaxed">
            본인 API 키로 직접 Claude API를 호출합니다. 키는 OS keychain(Windows Credential Manager / macOS Keychain)에 안전하게 저장돼요.
          </p>

          <label htmlFor="api-key" className="block text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKeyValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isValidKey && !saving) void handleSave(); }}
            placeholder="sk-ant-api03-..."
            className="w-full rounded-md border border-border bg-surface-alt px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          />

          {error !== null && (
            <p role="alert" className="mt-3 text-sm text-severity-critical">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void openApiKeysPage()}
            className="mt-3 text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
          >
            API 키 발급 페이지 열기 →
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isValidKey || saving}
            className="mt-6 w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '저장하고 시작'}
          </button>
        </section>

        <p className="text-center text-xs text-text-muted mt-6">
          Made by FirstNode · MIT License
        </p>
      </div>
    </div>
  );
};

export default Onboarding;
