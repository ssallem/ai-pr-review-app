/**
 * Settings — API 키 / GitHub 토큰 / 모델 / 테마 설정.
 *
 * 책임:
 *  - Anthropic API 키 저장·삭제 (OS keychain, 마스킹 표시).
 *  - GitHub Personal Access Token 저장·삭제 (선택).
 *  - Claude 모델 선택 (localStorage).
 *  - 테마 토글 light/dark/system (즉시 적용).
 *
 * 정책:
 *  - 시크릿은 storage.ts 의 keychain_* invoke 만 통해 OS keychain 에 저장.
 *  - 화면에는 마스킹된 값(sk-ant-xx...xxxx) 만 표시 — 평문 노출 X.
 *  - "보기" 토글 시에도 새로 입력하는 값만 노출, 저장된 키 자체는 노출하지 않음.
 *  - 150줄 한도 → SecretField/SectionCard/ModelSelect/ThemeToggle + useSecretState 훅 분할.
 */
import { useCallback, useState, type FC } from 'react';

import { checkClaudeCode } from '../lib/claudeCode';
import {
  applyTheme,
  deleteApiKey,
  deleteGithubToken,
  getApiKey,
  getGithubToken,
  getSettings,
  saveSettings,
  setApiKey,
  setGithubToken,
  type AppSettings,
  type AuthMode,
} from '../lib/storage';
import GithubAuthSection from './settings/GithubAuthSection';
import ModelSelect from './settings/ModelSelect';
import SecretField from './settings/SecretField';
import SectionCard from './settings/SectionCard';
import ThemeToggle from './settings/ThemeToggle';
import { useSecretState } from './settings/useSecretState';

interface Props {
  onClose: () => void;
  /** API 키 저장/삭제 후 부모(App.tsx)가 재라우팅 등을 처리할 수 있도록 알림. */
  onApiKeyChanged?: () => void;
}

const Settings: FC<Props> = ({ onClose, onApiKeyChanged }) => {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [message, setMessage] = useState<string | null>(null);

  const onSuccess = useCallback((m: string) => setMessage(m), []);
  const onError = useCallback((m: string) => setMessage(m), []);

  // API 키: sk-ant- prefix 검증 + 변경 시 부모 알림.
  const apiKey = useSecretState({
    getter: getApiKey,
    setter: async (v) => {
      await setApiKey(v);
      onApiKeyChanged?.();
    },
    deleter: async () => {
      await deleteApiKey();
      onApiKeyChanged?.();
    },
    validate: (v) => (v.startsWith('sk-ant-') ? null : 'API 키는 sk-ant-로 시작해야 합니다.'),
    confirmDeleteMessage: 'API 키를 삭제하시겠습니까? 다시 입력해야 사용할 수 있습니다.',
    onSuccess,
    onError,
  });

  const githubToken = useSecretState({
    getter: getGithubToken,
    setter: setGithubToken,
    deleter: deleteGithubToken,
    confirmDeleteMessage: 'GitHub 토큰을 삭제하시겠습니까?',
    onSuccess,
    onError,
  });

  const handleModelChange = (model: string): void => {
    saveSettings({ model });
    setSettings({ ...settings, model });
    setMessage(`모델이 ${model}로 변경됐습니다.`);
  };

  const handleThemeChange = (theme: AppSettings['theme']): void => {
    applyTheme(theme);
    setSettings({ ...settings, theme });
  };

  const handleAuthModeChange = async (mode: AuthMode): Promise<void> => {
    if (mode === settings.authMode) return;
    if (mode === 'claude-code') {
      // 전환 전 가용성 확인.
      const result = await checkClaudeCode();
      if (!result.available) {
        setMessage(
          `Claude Code 를 찾지 못해 모드를 바꾸지 않았어요. 설치 후 다시 시도해주세요. (${result.error ?? ''})`,
        );
        return;
      }
    }
    saveSettings({ authMode: mode });
    setSettings({ ...settings, authMode: mode });
    setMessage(
      mode === 'claude-code'
        ? 'Claude Code Max 모드로 전환했어요. (비용 ₩0)'
        : 'Anthropic API 키 모드로 전환했어요.',
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="flex items-center justify-between mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary">설정</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded"
        >
          ← 돌아가기
        </button>
      </header>

      {message !== null && (
        <div
          role="status"
          className="mb-6 p-3 rounded-md bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-700 text-sm text-brand-700 dark:text-brand-100"
        >
          {message}
        </div>
      )}

      <SectionCard
        title="인증 방식"
        description={
          settings.authMode === 'claude-code'
            ? '현재: Claude Code Max (CLI subprocess, 비용 ₩0)'
            : '현재: Anthropic API 키 (종량제)'
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleAuthModeChange('claude-code')}
            aria-pressed={settings.authMode === 'claude-code'}
            className={
              'p-3 rounded-md border-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ' +
              (settings.authMode === 'claude-code'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-100 font-semibold'
                : 'border-border bg-surface-alt hover:bg-surface text-text-primary')
            }
          >
            <span className="block font-bold mb-0.5">💎 Claude Code Max</span>
            <span className="block text-xs text-text-secondary">CLI subprocess · ₩0</span>
          </button>
          <button
            type="button"
            onClick={() => void handleAuthModeChange('api')}
            aria-pressed={settings.authMode === 'api'}
            className={
              'p-3 rounded-md border-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
              (settings.authMode === 'api'
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-100 font-semibold'
                : 'border-border bg-surface-alt hover:bg-surface text-text-primary')
            }
          >
            <span className="block font-bold mb-0.5">🔑 API 키</span>
            <span className="block text-xs text-text-secondary">Anthropic SDK · 종량제</span>
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Anthropic API 키"
        description={renderSecretDescription('OS keychain에 안전하게 저장됨', apiKey.masked, '미설정')}
      >
        <SecretField
          placeholder="sk-ant-api03-..."
          hasSaved={apiKey.hasSaved}
          onSave={apiKey.save}
          onDelete={apiKey.remove}
          toggleLabel="키 보기 토글"
        />
      </SectionCard>

      {/* 우선 노출: Device Flow OAuth. PAT 입력은 아래 "고급" 접힘 영역에 보관. */}
      <GithubAuthSection />

      <details className="mb-8 p-6 rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer text-sm font-semibold text-text-secondary hover:text-text-primary">
          고급: GitHub Personal Access Token 수동 입력
        </summary>
        <div className="mt-4">
          <p className="text-sm text-text-secondary mb-4">
            {renderSecretDescription(
              'OAuth 대신 PAT 를 직접 저장하고 싶을 때만 사용하세요',
              githubToken.masked,
              '미설정 (공개 PR만)',
            )}
          </p>
          <SecretField
            placeholder="ghp_..."
            hasSaved={githubToken.hasSaved}
            onSave={githubToken.save}
            onDelete={githubToken.remove}
            toggleLabel="토큰 보기 토글"
          />
        </div>
      </details>

      <SectionCard title="Claude 모델">
        <ModelSelect value={settings.model} onChange={handleModelChange} />
      </SectionCard>

      <SectionCard title="테마">
        <ThemeToggle value={settings.theme} onChange={handleThemeChange} />
      </SectionCard>
    </div>
  );
};

/** "<prefix>. 현재: <masked or emptyLabel>" 형태의 SectionCard 설명 노드 생성. */
function renderSecretDescription(prefix: string, masked: string, emptyLabel: string) {
  return (
    <>
      {prefix}. 현재:{' '}
      {masked !== '' ? (
        <span className="font-mono">{masked}</span>
      ) : (
        <em className="text-text-muted">{emptyLabel}</em>
      )}
    </>
  );
}

export default Settings;
