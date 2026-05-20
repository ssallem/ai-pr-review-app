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
} from '../lib/storage';
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

      <SectionCard
        title="GitHub Personal Access Token (선택)"
        description={renderSecretDescription(
          '비공개 PR 접근 또는 rate limit 회피용',
          githubToken.masked,
          '미설정 (공개 PR만)',
        )}
      >
        <SecretField
          placeholder="ghp_..."
          hasSaved={githubToken.hasSaved}
          onSave={githubToken.save}
          onDelete={githubToken.remove}
          toggleLabel="토큰 보기 토글"
        />
      </SectionCard>

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
