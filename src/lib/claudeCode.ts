/**
 * Claude Code CLI 통합 — Max 구독 모드.
 *
 * Tauri Rust 명령 `claude_code_check` / `claude_code_invoke` 를 통해
 * 로컬에 설치된 `claude` CLI 를 subprocess 로 실행. Max 정액 구독 사용 시 비용 ₩0.
 *
 * 시스템 경계 검증 (golden rule #6):
 *  - 사용자가 만든 diff/prompt 는 Rust subprocess stdin 으로만 전달 → 쉘 인젝션 차단.
 *  - 응답 raw 문자열은 parseReviewResponse 로 구조화 — JSON/마크다운 양쪽 처리.
 *
 * 사전 조건 (Windows):
 *  - Claude Code 가 설치되어 있어야 함 (`npm i -g @anthropic-ai/claude-code`)
 *  - npm 글로벌 bin (예: %APPDATA%\npm) 이 PATH 에 있어야 함.
 *  - Tauri 앱은 powershell 경유로 claude.ps1/claude.cmd 를 자동 탐색.
 */

import { invoke } from '@tauri-apps/api/core';

import type { DiffPayload, FullSourcePayload } from './githubClient';
import { FULL_SOURCE_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT } from './prompts';
import {
  buildFullSourceUserMessage,
  buildUserMessage,
  parseReviewResponse,
  type ReviewResult,
} from './reviewer';

/** Claude Code 가용성 체크 결과. */
export interface ClaudeCodeAvailability {
  available: boolean;
  version?: string;
  error?: string;
}

/**
 * Tauri 환경 가드 — 브라우저(`npm run preview`)에서는 invoke 가 throw 하므로
 * 화면 fold 대신 명시적 `{ available: false }` 를 반환해 Onboarding 으로 안전 fallback.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Claude Code CLI 가 PATH 에 있고 동작 가능한지 확인.
 * Tauri Rust `claude_code_check` 호출 → `claude --version` 실행.
 */
export async function checkClaudeCode(): Promise<ClaudeCodeAvailability> {
  if (!isTauri()) {
    return { available: false, error: 'Tauri 환경 아님 (브라우저 preview)' };
  }
  try {
    const version = await invoke<string>('claude_code_check');
    return { available: true, version };
  } catch (e) {
    return {
      available: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Claude Code CLI 를 통해 DiffPayload 를 리뷰.
 * `reviewDiff` 와 동일한 ReviewResult 형태 반환 — 호출자 분기 코드를 최소화.
 *
 * Max 모드는 토큰 사용량을 stdout 으로 노출하지 않으므로 usage 는 0/0 으로 기록.
 */
export async function reviewDiffWithClaudeCode(diff: DiffPayload): Promise<ReviewResult> {
  if (!isTauri()) {
    throw new Error('Claude Code 리뷰는 Tauri 데스크탑 앱에서만 동작합니다 (브라우저 preview 불가).');
  }
  // 빈 diff 가드 — reviewer.ts 와 동일 정책.
  if (diff.files.length === 0) {
    return {
      issues: [],
      summary: '변경된 파일이 없어 리뷰를 건너뜀.',
      warnings: ['empty diff'],
      raw_response: '',
      usage: { input_tokens: 0, output_tokens: 0 },
      duration_ms: 0,
    };
  }

  const userMessage = buildUserMessage(diff);
  const startedAt = Date.now();

  let rawResponse: string;
  try {
    rawResponse = await invoke<string>('claude_code_invoke', {
      prompt: REVIEW_SYSTEM_PROMPT,
      diff: userMessage,
    });
  } catch (e) {
    throw new Error(
      `Claude Code 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const durationMs = Date.now() - startedAt;

  const { issues, summary, warnings: parseWarnings } = parseReviewResponse(rawResponse);

  const warnings = [...parseWarnings];
  if (diff.truncated) {
    warnings.push('입력 diff가 절단됨 — 일부 변경이 리뷰에서 누락되었을 수 있음');
  }

  return {
    issues,
    summary: summary || rawResponse,
    warnings,
    raw_response: rawResponse,
    usage: {
      // Max 모드는 토큰 카운트를 응답에 노출하지 않음.
      input_tokens: 0,
      output_tokens: 0,
    },
    duration_ms: durationMs,
  };
}

/**
 * Claude Code(Max) CLI subprocess 로 전체 소스 리뷰.
 * `reviewDiffWithClaudeCode` 와 동일 패턴 — 시스템 프롬프트 + user message 빌더만 다름.
 *
 * 비용: ₩0 (사용자 본인 Claude.ai Max 구독 사용).
 * 한계: 50K LOC (단일 호출 한계, claudeCode 도 결국 같은 모델 호출).
 *       payload.truncated 가 true 면 warnings 에 명시.
 *
 * 주의: Rust `claude_code_invoke` 의 두 번째 인자 이름이 'diff' 지만 의미상 user message 다.
 *       Rust side 에서 `format!("{}\n\n{}", prompt, diff)` 로 단순 concat 후 stdin 으로 전달하므로
 *       전체 소스 user message 도 그대로 사용 가능.
 */
export async function reviewFullSourceWithClaudeCode(
  payload: FullSourcePayload,
): Promise<ReviewResult> {
  if (!isTauri()) {
    throw new Error('Claude Code 리뷰는 Tauri 데스크탑 앱에서만 동작합니다 (브라우저 preview 불가).');
  }
  // 빈 payload 가드 — reviewer.ts 와 동일 정책.
  if (payload.files.length === 0) {
    return {
      issues: [],
      summary: '리뷰할 파일이 없습니다 (필터 결과 0건).',
      warnings: ['파일 0건 — 필터 조건을 확인하세요'],
      raw_response: '',
      usage: { input_tokens: 0, output_tokens: 0 },
      duration_ms: 0,
    };
  }

  const userMessage = buildFullSourceUserMessage(payload);
  const startedAt = Date.now();

  let rawResponse: string;
  try {
    rawResponse = await invoke<string>('claude_code_invoke', {
      prompt: FULL_SOURCE_SYSTEM_PROMPT,
      diff: userMessage,
    });
  } catch (e) {
    throw new Error(
      `Claude Code 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const durationMs = Date.now() - startedAt;

  const { issues, summary, warnings: parseWarnings } = parseReviewResponse(rawResponse);

  const warnings = [...parseWarnings];
  if (payload.truncated) {
    warnings.push('입력 소스가 50K LOC 한계로 절단됨 — 일부 파일이 리뷰에서 누락됨');
  }

  return {
    issues,
    summary: summary || rawResponse,
    warnings,
    raw_response: rawResponse,
    usage: {
      // Max 모드는 토큰 카운트를 응답에 노출하지 않음.
      input_tokens: 0,
      output_tokens: 0,
    },
    duration_ms: durationMs,
  };
}
