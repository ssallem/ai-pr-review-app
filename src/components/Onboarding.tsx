/**
 * 첫 부팅 화면 — 2단계 인증 방식 선택.
 *
 * Phase 1-E (2026-05-18): Max 구독 사용자가 API 키 발급 없이 바로 시작할 수 있도록
 * 인증 방식 선택 단계를 추가.
 *
 * 흐름:
 *  Step 1: 인증 방식 선택
 *    - "Claude Code Max" (권장, 비용 ₩0) → checkClaudeCode → 가능하면 onComplete
 *    - "Anthropic API 키" → API 키 입력 화면으로 이동
 *  Step 2a (Max 모드): CLI 확인 실패 시 설치 안내
 *  Step 2b (API 모드): 기존 sk-ant- 키 입력 화면 그대로
 *
 * 보안:
 *  - API 키는 input type="password" + state 메모리에만 존재.
 *  - 절대 localStorage / console.log 금지.
 *
 * 시스템 경계 검증 (golden rule #6):
 *  - 사용자 입력은 신뢰 불가 → prefix + 길이 검증 후 storage 호출.
 */
import { useState, type FC } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { checkClaudeCode } from '../lib/claudeCode';
import { saveSettings, setApiKey } from '../lib/storage';

interface Props {
  /** 키 저장 / Max 모드 확정 시 호출 — 부모는 메인 화면으로 라우팅. */
  onComplete: () => void;
}

type Step = 'mode' | 'claude-code-check' | 'api-key';

const API_KEYS_URL = 'https://console.anthropic.com/settings/keys';
const CLAUDE_CODE_INSTALL_URL = 'https://docs.claude.com/claude-code';

const Onboarding: FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('mode');

  // Step 2a (Max 모드 확인) 상태
  const [checkingClaudeCode, setCheckingClaudeCode] = useState(false);
  const [claudeCodeVersion, setClaudeCodeVersion] = useState<string | null>(null);
  const [claudeCodeError, setClaudeCodeError] = useState<string | null>(null);

  // Step 2b (API 키 입력) 상태
  const [apiKey, setApiKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const isValidKey = apiKey.startsWith('sk-ant-') && apiKey.length > 20;

  // ─────────────────────────────────────────
  // Step 1 핸들러
  // ─────────────────────────────────────────

  const handleSelectClaudeCode = async (): Promise<void> => {
    setStep('claude-code-check');
    setCheckingClaudeCode(true);
    setClaudeCodeError(null);
    setClaudeCodeVersion(null);

    const result = await checkClaudeCode();
    setCheckingClaudeCode(false);

    if (result.available) {
      setClaudeCodeVersion(result.version ?? '');
      saveSettings({ authMode: 'claude-code' });
      // 곧바로 onComplete 호출 — 사용자에게 1초 정도 성공 메시지를 보여주고 진입.
      window.setTimeout(() => {
        onComplete();
      }, 800);
    } else {
      setClaudeCodeError(result.error ?? '알 수 없는 오류');
    }
  };

  const handleSelectApiKey = (): void => {
    setStep('api-key');
    setApiKeyError(null);
  };

  // ─────────────────────────────────────────
  // Step 2b (API 키) 핸들러
  // ─────────────────────────────────────────

  const handleSaveApiKey = async (): Promise<void> => {
    if (!isValidKey) {
      setApiKeyError('Anthropic API 키는 "sk-ant-"로 시작해야 합니다.');
      return;
    }
    setSaving(true);
    setApiKeyError(null);
    try {
      await setApiKey(apiKey);
      saveSettings({ authMode: 'api' });
      onComplete();
    } catch (e) {
      setApiKeyError(`키 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const openApiKeysPage = async (): Promise<void> => {
    try {
      await openUrl(API_KEYS_URL);
    } catch (e) {
      setApiKeyError(`브라우저 열기 실패. 직접 방문: ${API_KEYS_URL}`);
      console.error(e);
    }
  };

  const openClaudeCodeInstall = async (): Promise<void> => {
    try {
      await openUrl(CLAUDE_CODE_INSTALL_URL);
    } catch (e) {
      console.error(e);
    }
  };

  // ─────────────────────────────────────────
  // 렌더 — Step 1 (인증 방식 선택)
  // ─────────────────────────────────────────

  if (step === 'mode') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface text-text-primary">
        <div className="w-full max-w-2xl">
          <header className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-500 mb-3">
              AI PR Review Toolkit
            </h1>
            <p className="text-text-secondary text-lg">어떻게 시작할까요?</p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Claude Code Max 카드 */}
            <button
              type="button"
              onClick={() => void handleSelectClaudeCode()}
              className="text-left p-6 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <div className="text-3xl mb-3" aria-hidden="true">
                💎
              </div>
              <h2 className="text-lg font-bold text-emerald-700 dark:text-emerald-100 mb-2">
                Claude Code Max
              </h2>
              <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                Claude Code 가 설치되어 있고 Max 구독을 사용 중이라면 추가 비용 없이 시작.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100">
                  비용 ₩0
                </span>
                <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100">
                  API 키 불필요
                </span>
              </div>
            </button>

            {/* API 키 카드 */}
            <button
              type="button"
              onClick={handleSelectApiKey}
              className="text-left p-6 rounded-2xl border-2 border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <div className="text-3xl mb-3" aria-hidden="true">
                🔑
              </div>
              <h2 className="text-lg font-bold text-brand-700 dark:text-brand-100 mb-2">
                Anthropic API 키
              </h2>
              <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                console.anthropic.com 에서 발급한 API 키로 직접 호출. PR당 약 ₩200~500.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-brand-200 dark:bg-brand-800 text-brand-800 dark:text-brand-100">
                  종량제
                </span>
                <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-brand-200 dark:bg-brand-800 text-brand-800 dark:text-brand-100">
                  자동화 친화
                </span>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-text-muted mt-8">
            Made by FirstNode · MIT License
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 렌더 — Step 2a (Claude Code 확인)
  // ─────────────────────────────────────────

  if (step === 'claude-code-check') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface text-text-primary">
        <div className="w-full max-w-lg text-center">
          <button
            type="button"
            onClick={() => setStep('mode')}
            className="mb-4 text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
          >
            ← 인증 방식 다시 선택
          </button>

          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
            {checkingClaudeCode && (
              <>
                <div className="text-3xl mb-3" aria-hidden="true">
                  ⏳
                </div>
                <h2 className="text-xl font-bold mb-2">Claude Code 확인 중...</h2>
                <p className="text-sm text-text-secondary">
                  로컬에 설치된 Claude Code CLI 를 호출하고 있어요.
                </p>
              </>
            )}

            {!checkingClaudeCode && claudeCodeVersion !== null && (
              <>
                <div className="text-3xl mb-3" aria-hidden="true">
                  ✅
                </div>
                <h2 className="text-xl font-bold mb-2 text-emerald-700 dark:text-emerald-200">
                  Claude Code 사용 가능
                </h2>
                <p className="text-sm text-text-secondary mb-3">
                  버전:{' '}
                  <span className="font-mono">{claudeCodeVersion || '확인됨'}</span>
                </p>
                <p className="text-sm text-text-secondary">잠시 후 메인 화면으로 이동합니다...</p>
              </>
            )}

            {!checkingClaudeCode && claudeCodeError !== null && (
              <>
                <div className="text-3xl mb-3" aria-hidden="true">
                  ⚠️
                </div>
                <h2 className="text-xl font-bold mb-2 text-severity-critical">
                  Claude Code 를 찾지 못했어요
                </h2>
                <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                  설치 후 PATH 등록이 필요합니다. PowerShell 에서 직접 <span className="font-mono">claude --version</span> 이
                  동작하는지 확인해주세요.
                </p>
                <pre className="text-xs text-left bg-surface-alt rounded-md p-3 mb-4 overflow-x-auto">
                  {claudeCodeError}
                </pre>
                <div className="rounded-md bg-surface-alt p-3 mb-4 text-left text-xs font-mono text-text-secondary">
                  npm i -g @anthropic-ai/claude-code
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => void openClaudeCodeInstall()}
                    className="flex-1 rounded-md border border-border bg-surface-alt hover:bg-surface text-sm font-semibold py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    설치 가이드 열기 →
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSelectClaudeCode()}
                    className="flex-1 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    다시 확인
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSelectApiKey}
                  className="mt-3 text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
                >
                  대신 API 키로 시작하기 →
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // 렌더 — Step 2b (API 키 입력 — 기존 UI)
  // ─────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface text-text-primary">
      <div className="w-full max-w-lg">
        <button
          type="button"
          onClick={() => setStep('mode')}
          className="mb-4 text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
        >
          ← 인증 방식 다시 선택
        </button>

        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-500 mb-3">
            AI PR Review Toolkit
          </h1>
          <p className="text-text-secondary text-lg">Claude로 한국어 PR 리뷰를 시작해보세요</p>
        </header>

        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-bold text-text-primary mb-2">Anthropic API 키 등록</h2>
          <p className="text-sm text-text-secondary mb-5 leading-relaxed">
            본인 API 키로 직접 Claude API 를 호출합니다. 키는 OS keychain(Windows Credential
            Manager / macOS Keychain)에 안전하게 저장돼요.
          </p>

          <label
            htmlFor="api-key"
            className="block text-xs font-bold uppercase tracking-widest text-text-secondary mb-2"
          >
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKeyValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValidKey && !saving) void handleSaveApiKey();
            }}
            placeholder="sk-ant-api03-..."
            className="w-full rounded-md border border-border bg-surface-alt px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          />

          {apiKeyError !== null && (
            <p role="alert" className="mt-3 text-sm text-severity-critical">
              {apiKeyError}
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
            onClick={() => void handleSaveApiKey()}
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
