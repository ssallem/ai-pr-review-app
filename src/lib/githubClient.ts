/**
 * GitHub PR 로더.
 *
 * Python 봇의 `pr_reviewer/diff_loader.py::load_from_github_pr` 흐름을 그대로 따른다.
 *  - PR 메타 조회: GET /repos/{owner}/{repo}/pulls/{number}  (Accept: application/vnd.github+json)
 *  - PR diff 조회: 같은 endpoint에 Accept: application/vnd.github.v3.diff
 *  - 응답 diff를 100KB 한계로 잘라 파일 단위 hunk(20KB)로 분리.
 *
 * 시크릿(API token)은 함수 인자로만 받는다 — 전역 변수 금지.
 */

// ===== 타입 =====

/** 단일 파일의 변경. Python `FileDiff` 와 동등하되 `patch`+`truncated` 명시. */
export interface FileDiff {
  filename: string;
  language: string;
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
}

/** PR 메타데이터. Anthropic 리뷰 요청 본문에 그대로 직렬화됨. */
export interface PRMetadata {
  title: string;
  author: string;
  base_ref: string;
  head_ref: string;
  html_url: string;
  pr_number: number;
  body: string;
}

/** 리뷰러에 전달되는 단일 페이로드. */
export interface DiffPayload {
  meta: PRMetadata;
  files: FileDiff[];
  raw_diff: string;
  truncated: boolean;
  /** diff_loader.py 의 notes 와 동일 — 봇 자체 처리 메모. */
  notes: string[];
}

export interface ParsedPRUrl {
  owner: string;
  repo: string;
  number: number;
}

/** parseRepoUrl 결과 — PR 번호 없는 형태. */
export interface ParsedRepoUrl {
  owner: string;
  repo: string;
}

/** listPRs 응답 요약 — Input.tsx 카드 표시에 충분한 최소 필드. */
export interface PRSummary {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  author: string;
  /** ISO 8601. */
  created_at: string;
  updated_at: string;
  html_url: string;
  base_ref: string;
  head_ref: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

// ===== 상수 =====

/** Claude 컨텍스트 비용 보호용 임계값 — Python 봇과 동일. */
const MAX_DIFF_BYTES = 100 * 1024;
const MAX_FILE_HUNK_BYTES = 20 * 1024;

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

const DIFF_HEADER_RE = /^diff --git a\/(.+?) b\/(.+?)$/gm;

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.sh': 'bash',
  '.sql': 'sql',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.md': 'markdown',
};

// ===== URL 파싱 =====

const HTTPS_URL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i;
const SHORT_RE = /^([^/\s]+)\/([^/#\s]+)#(\d+)$/;

/**
 * GitHub PR URL을 파싱한다.
 * 지원:
 *   - https://github.com/{owner}/{repo}/pull/{number}
 *   - {owner}/{repo}#{number}
 */
export function parsePRUrl(input: string): ParsedPRUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const long = trimmed.match(HTTPS_URL_RE);
  if (long) {
    return {
      owner: long[1]!,
      repo: stripGitSuffix(long[2]!),
      number: Number(long[3]),
    };
  }

  const short = trimmed.match(SHORT_RE);
  if (short) {
    return {
      owner: short[1]!,
      repo: stripGitSuffix(short[2]!),
      number: Number(short[3]),
    };
  }

  return null;
}

function stripGitSuffix(repo: string): string {
  return repo.endsWith('.git') ? repo.slice(0, -4) : repo;
}

// ===== Repo URL 파싱 (PR 없는 형태) =====

// https://github.com/{owner}/{repo}[.git][/] [?query] [#frag]  — 추가 path segment 는 거부.
const REPO_HTTPS_URL_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?(?:\?[^#]*)?(?:#.*)?$/i;
// 단축형 'owner/repo' — 슬래시 하나, '#' 없음.
const REPO_SHORT_RE = /^([^/\s#]+)\/([^/\s#]+?)(?:\.git)?$/;

/**
 * GitHub repo URL을 파싱한다. PR 번호가 포함되면 매칭 실패(null) — parsePRUrl 로 분기하도록 유도.
 *
 * 지원:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - https://github.com/owner/repo/  (trailing slash)
 *   - owner/repo (단축형)
 *
 * 비대상: '/pull/123' / '/tree/...' 같은 추가 path 가 있는 URL.
 */
export function parseRepoUrl(input: string): ParsedRepoUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // PR URL이면 거른다 (호출자가 parsePRUrl 을 먼저 시도하는 것이 원칙이지만 방어).
  if (parsePRUrl(trimmed) !== null) return null;

  const long = trimmed.match(REPO_HTTPS_URL_RE);
  if (long) {
    return {
      owner: long[1]!,
      repo: stripGitSuffix(long[2]!),
    };
  }

  const short = trimmed.match(REPO_SHORT_RE);
  if (short) {
    return {
      owner: short[1]!,
      repo: stripGitSuffix(short[2]!),
    };
  }

  return null;
}

// ===== 언어 감지 =====

/** Python `_detect_language` 와 동일 동작. */
export function detectLanguage(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx < 0) return 'text';
  const ext = filename.slice(dotIdx).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? 'text';
}

// ===== GitHub API 호출 =====

/**
 * GitHub REST API로 PR 메타 + diff 를 가져온다.
 *
 * @param parsed - parsePRUrl 결과.
 * @param githubToken - 선택. 비어있으면 비인증 호출(rate limit 60/h).
 *                       시크릿은 함수 인자로만 — 절대 전역 보관 금지.
 * @returns DiffPayload — 리뷰러에 그대로 넘길 수 있는 형태.
 * @throws Error - "PR not found" (404), "Invalid token" (401), "Rate limit" (403), 네트워크 등.
 */
export async function loadPRFromGitHub(
  parsed: ParsedPRUrl,
  githubToken?: string,
): Promise<DiffPayload> {
  const base = `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`;
  const baseHeaders = buildHeaders(githubToken);

  // 1) 메타
  const metaRes = await fetch(base, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github+json' },
  });
  await throwIfBad(metaRes, '메타');
  const metaJson = (await metaRes.json()) as RawPRMeta;

  // 2) diff
  const diffRes = await fetch(base, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github.v3.diff' },
  });
  await throwIfBad(diffRes, 'diff');
  const rawDiffText = await diffRes.text();

  const meta: PRMetadata = {
    title: metaJson.title ?? '',
    author: metaJson.user?.login ?? '',
    base_ref: metaJson.base?.ref ?? '',
    head_ref: metaJson.head?.ref ?? '',
    html_url: metaJson.html_url ?? '',
    pr_number: parsed.number,
    body: metaJson.body ?? '',
  };

  return buildPayload(rawDiffText, meta);
}

interface RawPRMeta {
  title?: string;
  body?: string;
  html_url?: string;
  user?: { login?: string };
  base?: { ref?: string };
  head?: { ref?: string };
}

/**
 * Repo의 최근 PR 목록을 가져온다. updated 내림차순.
 *
 * @param owner - 'ssallem'
 * @param repo - 'local-fx'
 * @param token - 선택. private repo 또는 rate limit 회피 시 필요.
 * @param state - 'open' | 'closed' | 'all' (기본 'all').
 * @param perPage - 1~100 (기본 20).
 * @returns PRSummary 배열 — html_url, additions, deletions 등 카드 표시용.
 * @throws Error - 401/403/404 및 rate limit.
 */
export async function listPRs(
  owner: string,
  repo: string,
  token?: string,
  state: 'open' | 'closed' | 'all' = 'all',
  perPage: number = 20,
): Promise<PRSummary[]> {
  const clamped = Math.max(1, Math.min(100, Math.floor(perPage)));
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=${state}&per_page=${clamped}&sort=updated&direction=desc`;
  const headers = {
    ...buildHeaders(token),
    Accept: 'application/vnd.github+json',
  };

  const res = await fetch(url, { headers });
  await throwIfBad(res, 'PR 목록');
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('GitHub PR 목록 응답이 배열이 아닙니다.');
  }

  return raw.map(toPRSummary).filter((v): v is PRSummary => v !== null);
}

/** GitHub PR list element → PRSummary 변환. 필수 필드 누락 시 null. */
function toPRSummary(item: unknown): PRSummary | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;

  if (typeof r.number !== 'number' || typeof r.title !== 'string') return null;

  const state = r.state === 'closed' ? 'closed' : 'open';
  const user = r.user as { login?: string } | undefined;
  const head = r.head as { ref?: string } | undefined;
  const base = r.base as { ref?: string } | undefined;

  return {
    number: r.number,
    title: r.title,
    state,
    merged: typeof r.merged_at === 'string' && r.merged_at.length > 0,
    draft: r.draft === true,
    author: typeof user?.login === 'string' ? user.login : '',
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
    html_url: typeof r.html_url === 'string' ? r.html_url : '',
    base_ref: typeof base?.ref === 'string' ? base.ref : '',
    head_ref: typeof head?.ref === 'string' ? head.ref : '',
    // GitHub list endpoint 는 additions/deletions/changed_files를 항상 보장하진 않는다 → 0 fallback.
    additions: typeof r.additions === 'number' ? r.additions : 0,
    deletions: typeof r.deletions === 'number' ? r.deletions : 0,
    changed_files: typeof r.changed_files === 'number' ? r.changed_files : 0,
  };
}

function buildHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'ai-pr-review-app',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function throwIfBad(res: Response, kind: string): Promise<void> {
  if (res.ok) return;
  const status = res.status;
  // GitHub rate limit은 403 + X-RateLimit-Remaining: 0 형태로 옴.
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (status === 404) throw new Error('PR not found (404): URL 또는 접근 권한을 확인하세요');
  if (status === 401) throw new Error('Invalid token (401): GitHub 토큰을 다시 확인하세요');
  if (status === 403 && remaining === '0') {
    throw new Error('Rate limit (403): GitHub API 호출 한도 초과. 토큰을 추가하거나 잠시 후 재시도하세요');
  }
  if (status === 403) throw new Error('Forbidden (403): 토큰 권한 또는 SAML SSO 확인 필요');
  let body = '';
  try { body = (await res.text()).slice(0, 300); } catch { /* 무시 */ }
  throw new Error(`GitHub API ${status} (${kind}): ${body}`);
}

// ===== diff → payload =====

function buildPayload(rawDiffText: string, meta: PRMetadata): DiffPayload {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(rawDiffText).length;
  const notes: string[] = [];
  let truncatedOverall = false;

  const fileChunks = splitIntoFiles(rawDiffText);
  const files: FileDiff[] = [];

  for (const { filename, chunk } of fileChunks) {
    const chunkBytes = encoder.encode(chunk).length;
    let patch = chunk;
    let truncated = false;
    if (chunkBytes > MAX_FILE_HUNK_BYTES) {
      truncatedOverall = true;
      truncated = true;
      patch = truncateByBytes(chunk, MAX_FILE_HUNK_BYTES) +
        `\n... [truncated: 원본 ${chunkBytes} bytes]\n`;
      notes.push(`${filename}: hunk 길이 초과로 일부 절단됨`);
    }
    const { additions, deletions } = countChanges(patch);
    files.push({
      filename,
      language: detectLanguage(filename),
      additions,
      deletions,
      patch,
      truncated,
    });
  }

  let finalRawDiff = rawDiffText;
  if (totalBytes > MAX_DIFF_BYTES) {
    truncatedOverall = true;
    finalRawDiff = truncateByBytes(rawDiffText, MAX_DIFF_BYTES) +
      `\n... [truncated: 원본 ${totalBytes} bytes]\n`;
    notes.push(
      `전체 diff 크기 ${totalBytes} bytes가 한계(${MAX_DIFF_BYTES})를 초과해 절단 적용됨`,
    );
  }

  return {
    meta,
    files,
    raw_diff: finalRawDiff,
    truncated: truncatedOverall,
    notes,
  };
}

interface FileChunk { filename: string; chunk: string; }

/** unified diff을 파일 단위로 분리. b/ 경로(target)를 파일명으로 사용. */
function splitIntoFiles(diffText: string): FileChunk[] {
  const matches: Array<{ filename: string; start: number }> = [];
  // 매번 새 regex (lastIndex 상태 보존 필요).
  const re = new RegExp(DIFF_HEADER_RE.source, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(diffText)) !== null) {
    matches.push({ filename: m[2]!, start: m.index });
  }
  if (matches.length === 0) return [];

  const out: FileChunk[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.start;
    const end = i + 1 < matches.length ? matches[i + 1]!.start : diffText.length;
    out.push({ filename: matches[i]!.filename, chunk: diffText.slice(start, end) });
  }
  return out;
}

/** +/- 시작 라인 수 카운트. `+++`/`---` 헤더는 제외 (Python 동작과 동일). */
function countChanges(hunkText: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of hunkText.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) deletions++;
  }
  return { additions, deletions };
}

/** UTF-8 byte 길이 기준 절단. 잘려 깨진 멀티바이트는 TextDecoder fatal=false 로 무시. */
function truncateByBytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const buf = encoder.encode(text);
  if (buf.length <= maxBytes) return text;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(buf.slice(0, maxBytes));
}
