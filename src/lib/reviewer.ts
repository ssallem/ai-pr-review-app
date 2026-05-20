/**
 * Claude AI 기반 PR 리뷰 호출.
 *
 * Python 봇의 `pr_reviewer/reviewer.py::review_diff` 흐름을 그대로 따른다.
 *  - 시스템 프롬프트는 prompts.ts 의 REVIEW_SYSTEM_PROMPT (cache_control ephemeral).
 *  - user message 는 _build_user_message 와 동일한 구조로 직렬화.
 *  - JSON 응답 우선, 실패 시 raw 보존 + warning 추가.
 *
 * 시크릿(anthropicApiKey)은 함수 인자로만 받는다. 전역 보관 금지.
 */

import Anthropic from '@anthropic-ai/sdk';
// Tauri 2 plugin-http: api.anthropic.com 자체는 CORS 허용이지만, 일관된 네트워크 경로를 위해
// plugin-http 의 fetch 를 Anthropic SDK 의 fetch 옵션으로 주입한다. capabilities/default.json 에 호스트 허용.
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import type { DiffPayload } from './githubClient';
import { REVIEW_SYSTEM_PROMPT } from './prompts';

// ===== 타입 =====

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

export interface ReviewIssue {
  severity: Severity;
  file?: string;
  line?: number;
  category: string;
  message: string;
  suggested_fix?: string;
}

export interface ReviewUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
  warnings: string[];
  raw_response: string;
  usage: ReviewUsage;
  duration_ms: number;
}

export interface ReviewOptions {
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4000;

// ===== 메인 호출 =====

/**
 * DiffPayload 를 Claude AI로 보내 코드 리뷰를 생성한다.
 *
 * @param diff - githubClient.loadPRFromGitHub 결과.
 * @param anthropicApiKey - 사용자 본인 Anthropic API 키.
 * @param options - 모델·토큰 오버라이드.
 * @throws Error - 인증 실패, rate limit, 네트워크 등.
 */
export async function reviewDiff(
  diff: DiffPayload,
  anthropicApiKey: string,
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  if (!anthropicApiKey) {
    throw new Error('Anthropic API 키가 비어있습니다');
  }

  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  // 빈 diff 가드 — Python 봇과 동일하게 API 호출 없이 빠르게 반환.
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

  // 브라우저(Tauri WebView) 환경에서는 dangerouslyAllowBrowser 필요.
  // 실제 호출은 사용자 본인 키로만 일어나며, 키는 한 호출에 한해서만 사용된다.
  // fetch 옵션 — plugin-http 로 통일해 CORS / 네트워크 정책 일관성 유지.
  const client = new Anthropic({
    apiKey: anthropicApiKey,
    dangerouslyAllowBrowser: true,
    fetch: tauriFetch,
  });

  const userMessage = buildUserMessage(diff);
  const startedAt = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: REVIEW_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const durationMs = Date.now() - startedAt;
  const rawText = extractText(response);
  const { issues, summary, warnings: parseWarnings } = parseReviewResponse(rawText);

  const warnings = [...parseWarnings];
  if (diff.truncated) {
    warnings.push('입력 diff가 절단됨 — 일부 변경이 리뷰에서 누락되었을 수 있음');
  }

  return {
    issues,
    summary: summary || rawText,
    warnings,
    raw_response: rawText,
    usage: extractUsage(response),
    duration_ms: durationMs,
  };
}

// ===== user message 조립 =====

/**
 * DiffPayload 를 Claude 에 보낼 user message 문자열로 직렬화.
 * claudeCode.ts(Max 모드)에서도 동일 포맷을 쓸 수 있도록 export.
 */
export function buildUserMessage(diff: DiffPayload): string {
  const lines: string[] = [];

  // PR 메타
  lines.push('# PR 메타');
  const m = diff.meta;
  if (m.title) lines.push(`- title: ${m.title}`);
  if (m.author) lines.push(`- author: ${m.author}`);
  if (m.base_ref) lines.push(`- base_ref: ${m.base_ref}`);
  if (m.head_ref) lines.push(`- head_ref: ${m.head_ref}`);
  if (m.html_url) lines.push(`- html_url: ${m.html_url}`);
  if (m.body) lines.push(`- body:\n${m.body}`);
  lines.push('');

  if (diff.notes.length > 0) {
    lines.push('# 처리 메모');
    for (const note of diff.notes) lines.push(`- ${note}`);
    lines.push('');
  }

  lines.push(`# 변경된 파일 (${diff.files.length}개)`);
  for (const f of diff.files) {
    lines.push(`- ${f.filename} (+${f.additions} / -${f.deletions}, ${f.language})`);
  }
  lines.push('');

  lines.push('# diff (unified format)');
  for (const f of diff.files) {
    lines.push(`\n## ${f.filename}`);
    lines.push('```diff');
    lines.push(f.patch);
    lines.push('```');
  }

  lines.push('');
  lines.push('위 변경 사항을 시스템 프롬프트의 5가지 관점으로 검토하고 JSON으로 답변하라.');
  return lines.join('\n');
}

// ===== 응답 텍스트 / usage 추출 =====

interface MaybeAnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function extractText(response: unknown): string {
  const r = response as MaybeAnthropicResponse;
  const content = r?.content ?? [];
  const parts: string[] = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

function extractUsage(response: unknown): ReviewUsage {
  const r = response as MaybeAnthropicResponse;
  const u = r?.usage ?? {};
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens,
  };
}

// ===== 응답 파서 =====

/**
 * Claude 응답을 ReviewIssue[] 로 파싱.
 *  - 1순위: JSON (코드펜스 안/밖 모두 시도).
 *  - 2순위: 마크다운 fallback — `## CRITICAL/WARNING/SUGGESTION (N건)` 섹션의 bullet 항목.
 *  - 어느 것도 실패하면 issues=[], summary=raw, warning 추가.
 */
export function parseReviewResponse(raw: string): {
  issues: ReviewIssue[];
  summary: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const trimmed = raw.trim();
  if (!trimmed) {
    return { issues: [], summary: '', warnings: ['빈 응답'] };
  }

  // 1) JSON 시도
  const jsonText = stripCodeFence(trimmed) ?? extractJsonBlock(trimmed) ?? trimmed;
  const fromJson = tryParseJson(jsonText, warnings);
  if (fromJson) return { ...fromJson, warnings };

  // 2) 마크다운 fallback
  const fromMarkdown = parseMarkdownSections(raw);
  if (fromMarkdown.issues.length > 0 || fromMarkdown.summary) {
    warnings.push('JSON 파싱 실패 — 마크다운 fallback parser 사용');
    return { ...fromMarkdown, warnings };
  }

  // 3) 완전 실패 — raw 보존
  warnings.push('응답을 구조화하지 못함 — raw 텍스트를 summary 로 저장');
  return { issues: [], summary: raw, warnings };
}

/** ```json ... ``` 또는 ``` ... ``` 펜스 안쪽만 추출. 없으면 null. */
function stripCodeFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return m ? m[1]!.trim() : null;
}

/** raw 안에서 가장 바깥쪽 `{ ... }` 블록만 추출 (describer.py _JSON_BLOCK_RE 와 동일). */
function extractJsonBlock(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

interface JsonReviewShape {
  issues?: unknown;
  summary?: unknown;
}

function tryParseJson(
  candidate: string,
  warnings: string[],
): { issues: ReviewIssue[]; summary: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const shaped = parsed as JsonReviewShape;
  const rawIssues = Array.isArray(shaped.issues) ? shaped.issues : [];
  if (!Array.isArray(shaped.issues) && shaped.issues !== undefined) {
    warnings.push('issues 가 배열이 아님 — 빈 배열로 처리');
  }

  const issues: ReviewIssue[] = [];
  rawIssues.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      warnings.push(`issues[${idx}] 객체 아님 — 건너뜀`);
      return;
    }
    const obj = item as Record<string, unknown>;
    const severity = normalizeSeverity(obj.severity);
    issues.push({
      severity,
      file: typeof obj.file === 'string' && obj.file ? obj.file : undefined,
      line: typeof obj.line === 'number' ? obj.line : undefined,
      category: typeof obj.category === 'string' ? obj.category : 'style',
      message: typeof obj.message === 'string' ? obj.message : '',
      suggested_fix: typeof obj.suggested_fix === 'string' ? obj.suggested_fix : undefined,
    });
  });

  const summary = typeof shaped.summary === 'string' ? shaped.summary : '';
  return { issues, summary };
}

function normalizeSeverity(value: unknown): Severity {
  const s = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (s === 'CRITICAL' || s === 'WARNING' || s === 'SUGGESTION') return s;
  return 'SUGGESTION';
}

// ----- 마크다운 fallback (toolkit issue-parser 패턴 재사용) -----

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'];

function parseMarkdownSections(markdown: string): { issues: ReviewIssue[]; summary: string } {
  const summary = extractH2(markdown, /한\s*줄\s*요약|요약/);
  const issues: ReviewIssue[] = [];
  const proseExtras: string[] = [];

  for (const severity of SEVERITY_ORDER) {
    const body = extractH2(markdown, new RegExp(`${severity}\\s*\\(`));
    if (!body) continue;
    const { issues: sevIssues, prose } = parseSeveritySection(body, severity);
    issues.push(...sevIssues);
    if (prose) proseExtras.push(`**${severity}**: ${prose}`);
  }

  const finalSummary = [summary, ...proseExtras].filter(Boolean).join('\n\n');
  return { issues, summary: finalSummary };
}

/** H2 헤더 본문(다음 H2 전까지)을 추출. 코드펜스 안의 ## 는 무시. */
function extractH2(markdown: string, headerPattern: RegExp): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;
    if (line.startsWith('## ') && headerPattern.test(line)) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return '';

  inFence = false;
  for (let i = 0; i < startIdx; i++) {
    if (/^```/.test(lines[i]!.trim())) inFence = !inFence;
  }
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line.trim())) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (line.startsWith('## ')) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join('\n').trim();
}

function parseSeveritySection(
  body: string,
  severity: Severity,
): { issues: ReviewIssue[]; prose: string } {
  if (!body) return { issues: [], prose: '' };
  const firstBullet = body.search(/^-\s+/m);
  let prose = '';
  let bulletBlock = body;
  if (firstBullet === -1) {
    prose = body.trim();
    bulletBlock = '';
  } else if (firstBullet > 0) {
    prose = body.slice(0, firstBullet).trim();
    bulletBlock = body.slice(firstBullet);
  }
  const bullets = bulletBlock ? splitTopLevelBullets(bulletBlock) : [];
  const issues: ReviewIssue[] = bullets.map((bullet) => {
    const { location, body: msg } = parseBullet(bullet);
    const { file, line } = splitLocation(location);
    return {
      severity,
      file,
      line,
      category: severityToCategory(severity),
      message: msg,
    };
  });
  return { issues, prose };
}

function splitTopLevelBullets(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let cur: string[] = [];
  const flush = (): void => {
    if (cur.length > 0) { out.push(cur.join('\n').trim()); cur = []; }
  };
  for (const line of lines) {
    if (/^-\s+/.test(line)) { flush(); cur.push(line); }
    else if (cur.length > 0) cur.push(line);
  }
  flush();
  return out;
}

function parseBullet(bullet: string): { location: string; body: string } {
  const trimmed = bullet.replace(/^-\s+/, '');
  const m = trimmed.match(/^\*\*([^*]+)\*\*\s*[—–\-:]?\s*/);
  if (!m) return { location: '', body: trimmed.trim() };
  return { location: m[1]!.trim(), body: trimmed.slice(m[0].length).trim() };
}

function splitLocation(location: string): { file?: string; line?: number } {
  if (!location) return {};
  // 형식 예: "path/to/file.ts:42" 또는 "path:10-20"
  const m = location.match(/^(.+?):(\d+)(?:-\d+)?$/);
  if (!m) return { file: location };
  return { file: m[1]!, line: Number(m[2]) };
}

function severityToCategory(severity: Severity): string {
  // 마크다운 fallback 은 category 정보가 없으므로 severity 별 기본값.
  if (severity === 'CRITICAL') return 'potential_bug';
  if (severity === 'WARNING') return 'potential_bug';
  return 'style';
}
