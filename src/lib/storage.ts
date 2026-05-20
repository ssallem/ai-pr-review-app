/**
 * 통합 storage 모듈 — Phase 1-C.
 *
 * 3가지 데이터 카테고리를 다룬다:
 *   1) 시크릿 (API 키 / GitHub 토큰): OS keychain (Tauri Rust command `keychain_*`).
 *      Windows Credential Manager / macOS Keychain Access / Linux Secret Service.
 *   2) 일반 설정 (model / theme / language): localStorage (평문이어도 무해한 값).
 *   3) 최근 사용 기록 (최대 5건): localStorage (요약 정보만, 본문 X).
 *
 * 시크릿은 절대 localStorage / sessionStorage / 평문 파일에 두지 않는다.
 * 모든 함수는 작은 단일 책임으로 유지 (50줄 미만).
 */

import { invoke } from '@tauri-apps/api/core';

/** keychain 서비스 이름 — tauri.conf.json identifier 와 동일하게 맞춘다. */
const SERVICE = 'com.firstnode.ai-pr-review-app';

// ─────────────────────────────────────────
// 1) 시크릿 — OS keychain
// ─────────────────────────────────────────

/** keychain 항목 식별자 — 컴파일 타임 상수로 오타 방지. */
const KEY_ANTHROPIC = 'anthropic_api_key';
const KEY_GITHUB = 'github_token';

/**
 * Anthropic API 키를 OS keychain에 안전하게 저장.
 * Windows: Credential Manager / macOS: Keychain Access / Linux: Secret Service.
 */
export async function setApiKey(key: string): Promise<void> {
  await invoke<void>('keychain_set', {
    service: SERVICE,
    key: KEY_ANTHROPIC,
    value: key,
  });
}

/** 저장된 Anthropic API 키 조회. 없으면 null. */
export async function getApiKey(): Promise<string | null> {
  return await invoke<string | null>('keychain_get', {
    service: SERVICE,
    key: KEY_ANTHROPIC,
  });
}

/** Anthropic API 키 삭제. 항목이 없어도 에러 없이 정상 종료. */
export async function deleteApiKey(): Promise<void> {
  await invoke<void>('keychain_delete', {
    service: SERVICE,
    key: KEY_ANTHROPIC,
  });
}

/**
 * GitHub Personal Access Token (선택 — 비공개 PR / rate limit 회피).
 */
export async function setGithubToken(token: string): Promise<void> {
  await invoke<void>('keychain_set', {
    service: SERVICE,
    key: KEY_GITHUB,
    value: token,
  });
}

/** 저장된 GitHub 토큰 조회. 없으면 null. */
export async function getGithubToken(): Promise<string | null> {
  return await invoke<string | null>('keychain_get', {
    service: SERVICE,
    key: KEY_GITHUB,
  });
}

/** GitHub 토큰 삭제. 항목이 없어도 정상. */
export async function deleteGithubToken(): Promise<void> {
  await invoke<void>('keychain_delete', {
    service: SERVICE,
    key: KEY_GITHUB,
  });
}

// ─────────────────────────────────────────
// 2) 일반 설정 — localStorage
// ─────────────────────────────────────────

export type AuthMode = 'api' | 'claude-code';

export interface AppSettings {
  /** 사용 모델 ID — reviewer.ts DEFAULT_MODEL 과 동기화. */
  model: string;
  /** 다크모드 모드 — 'system' 이면 OS prefers-color-scheme 따름. */
  theme: 'light' | 'dark' | 'system';
  /** UI 언어. 현재 ko 기본, 향후 i18n 확장. */
  language: 'ko' | 'en';
  /**
   * 인증 방식.
   *   - 'claude-code': Claude Code CLI subprocess (Max 구독, 비용 ₩0).
   *   - 'api': Anthropic API 키 직접 호출 (종량제).
   * 기본은 Max 사용자 친화로 'claude-code'.
   */
  authMode: AuthMode;
}

const SETTINGS_KEY = 'app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  model: 'claude-sonnet-4-6',
  theme: 'system',
  language: 'ko',
  authMode: 'claude-code',
};

/**
 * 현재 설정을 반환. 미저장 또는 파싱 실패 시 기본값.
 * 시스템 경계 검증 — 외부 저장소에서 읽은 값은 항상 기본값과 머지.
 */
export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 부분 설정 저장 — 기존 값과 머지 후 영속화. */
export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings();
  const next = sanitizeSettings({ ...current, ...settings });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

/**
 * 외부에서 들어온 Partial<AppSettings> 를 enum 값 검증 후 채워서 반환.
 * 알 수 없는 theme/language 값은 기본값으로 fallback.
 */
function sanitizeSettings(input: Partial<AppSettings>): AppSettings {
  const theme = input.theme;
  const language = input.language;
  const authMode = input.authMode;
  return {
    model: typeof input.model === 'string' && input.model ? input.model : DEFAULT_SETTINGS.model,
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_SETTINGS.theme,
    language: language === 'ko' || language === 'en' ? language : DEFAULT_SETTINGS.language,
    authMode: authMode === 'api' || authMode === 'claude-code' ? authMode : DEFAULT_SETTINGS.authMode,
  };
}

// ─────────────────────────────────────────
// 3) 최근 사용 기록 — localStorage
// ─────────────────────────────────────────

export interface RecentReview {
  /** UUID — 결과 화면 라우팅 / 캐시 키. */
  id: string;
  /** 원본 PR URL — 중복 제거 키로도 사용. */
  pr_url: string;
  pr_title: string;
  /** ISO 8601 형식. */
  date: string;
  critical: number;
  warning: number;
  suggestion: number;
  duration_sec: number;
  // 본문은 저장하지 않음 — 크기 부담. id로 다시 조회 시 결과 캐시는 별도 IndexedDB (v0.2)
}

const RECENT_KEY = 'recent_reviews';
const MAX_RECENT = 5;

/** 저장된 최근 리뷰 목록. 파싱 실패 시 빈 배열. */
export function getRecentReviews(): RecentReview[] {
  const raw = localStorage.getItem(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentReview);
  } catch {
    return [];
  }
}

/**
 * 새 리뷰 1건을 추가. 같은 PR URL이 이미 있으면 제거 후 맨 앞에 삽입.
 * 최대 MAX_RECENT 건만 유지.
 */
export function addRecentReview(review: RecentReview): void {
  const current = getRecentReviews();
  const filtered = current.filter((r) => r.pr_url !== review.pr_url);
  const next = [review, ...filtered].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

/** 최근 기록 전체 삭제. */
export function clearRecentReviews(): void {
  localStorage.removeItem(RECENT_KEY);
}

/** 외부에서 읽은 값이 RecentReview 형태인지 런타임 검증. */
function isRecentReview(value: unknown): value is RecentReview {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.pr_url === 'string' &&
    typeof v.pr_title === 'string' &&
    typeof v.date === 'string' &&
    typeof v.critical === 'number' &&
    typeof v.warning === 'number' &&
    typeof v.suggestion === 'number' &&
    typeof v.duration_sec === 'number'
  );
}

// ─────────────────────────────────────────
// 4) 다크모드 토글
// ─────────────────────────────────────────

/**
 * theme 설정과 OS prefers-color-scheme을 합쳐 실제 적용할 다크 여부 반환.
 */
export function getEffectiveTheme(): 'light' | 'dark' {
  const { theme } = getSettings();
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * <html> 클래스에 다크모드 적용 + 설정 저장.
 * 호출 시점: 앱 부팅 직후, 사용자 설정 변경 시.
 */
export function applyTheme(theme: AppSettings['theme']): void {
  saveSettings({ theme });
  const effective = getEffectiveTheme();
  if (effective === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
