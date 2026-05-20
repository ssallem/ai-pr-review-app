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

// Tauri 2 plugin-http: api.github.com 도 WebView fetch 시 CORS / 일부 응답 헤더(특히 raw diff text)
// 처리에 제약이 있어 안정성을 위해 plugin-http 사용. capabilities/default.json 에 호스트 화이트리스트 필요.
import { fetch } from '@tauri-apps/plugin-http';

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

/** parseCommitUrl 결과 — 단일 커밋(PR 아님). */
export interface ParsedCommitUrl {
  owner: string;
  repo: string;
  /** 7~40자 hex (소문자 정규화). */
  sha: string;
}

/** parseCompareUrl 결과 — 두 ref 사이 비교(PR 아님). */
export interface ParsedCompareUrl {
  owner: string;
  repo: string;
  /** branch 이름 · tag · SHA. URL-디코딩됨 (feature%2Fx → feature/x). */
  base: string;
  head: string;
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

/** listRecentCommits 응답 요약 — Input.tsx 커밋 카드 표시용 최소 필드. */
export interface CommitSummary {
  /** 40자 full SHA. */
  sha: string;
  /** 첫 7자 (UI 표시용). */
  short_sha: string;
  /** 커밋 메시지 첫 줄 (제목). */
  message: string;
  /** 전체 커밋 메시지 (제목 + 본문). */
  full_message: string;
  /** 작성자 이름 — GitHub login 우선, 없으면 commit.author.name. */
  author: string;
  /** 작성자 이메일 (있을 때만). */
  author_email?: string;
  /** committer.date (ISO 8601). */
  date: string;
  /** GitHub commit 페이지 URL. */
  html_url: string;
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

// ===== Commit URL 파싱 =====

// 단축형 'owner/repo@sha' — '.git' 접미사도 허용.
const COMMIT_SHORT_RE = /^([^/\s]+)\/([^/@\s]+?)(?:\.git)?@([a-f0-9]{7,40})$/i;
const SHA_RE = /^[a-f0-9]{7,40}$/i;

/**
 * GitHub commit URL을 파싱한다.
 * 지원:
 *   - https://github.com/{owner}/{repo}/commit/{sha}
 *   - https://github.com/{owner}/{repo}/commit/{sha}.diff (확장자 자동 제거)
 *   - https://github.com/{owner}/{repo}/commit/{sha}.patch
 *   - {owner}/{repo}@{sha}  (단축형)
 *
 * 안전한 파싱을 위해 정규식 대신 URL 생성자 + pathname 분할 사용.
 */
export function parseCommitUrl(input: string): ParsedCommitUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1) 단축형
  const short = trimmed.match(COMMIT_SHORT_RE);
  if (short) {
    return {
      owner: short[1]!,
      repo: stripGitSuffix(short[2]!),
      sha: short[3]!.toLowerCase(),
    };
  }

  // 2) 풀 URL — 시스템 경계 검증을 위해 URL 생성자 사용
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'github.com') return null;

  const segments = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  // [owner, repo, 'commit', sha]
  if (segments.length !== 4) return null;
  if (segments[2] !== 'commit') return null;

  const owner = segments[0]!;
  const repo = stripGitSuffix(segments[1]!);
  // .diff / .patch 확장자 제거
  const sha = segments[3]!.replace(/\.(diff|patch)$/i, '');

  if (!SHA_RE.test(sha)) return null;
  if (!owner || !repo) return null;

  return { owner, repo, sha: sha.toLowerCase() };
}

// ===== Compare URL 파싱 =====

/**
 * GitHub compare URL을 파싱한다.
 * 지원:
 *   - https://github.com/{owner}/{repo}/compare/{base}...{head}
 *   - https://github.com/{owner}/{repo}/compare/{base}..{head}   (점 2개도)
 *
 * base/head 는 branch 이름(슬래시 포함 가능) · tag · SHA. URL-인코딩 슬래시(`%2F`)도 허용.
 */
export function parseCompareUrl(input: string): ParsedCompareUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'github.com') return null;

  const cleaned = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = cleaned.split('/');
  // 최소: [owner, repo, 'compare', spec...]
  if (segments.length < 4) return null;
  if (segments[2] !== 'compare') return null;

  const owner = segments[0]!;
  const repo = stripGitSuffix(segments[1]!);
  if (!owner || !repo) return null;

  // base/head 둘 다 '/'를 포함할 수 있어 segments[3..] 를 join 후 ...(또는 ..)로 분할
  const spec = segments.slice(3).join('/');
  const split = splitCompareSpec(spec);
  if (split === null) return null;

  const base = decodeURIComponent(split.base);
  const head = decodeURIComponent(split.head);
  if (!base || !head) return null;

  return { owner, repo, base, head };
}

/** compare spec(`base...head` 또는 `base..head`) 분할. 3-dot 우선. */
function splitCompareSpec(spec: string): { base: string; head: string } | null {
  const triple = spec.indexOf('...');
  if (triple >= 0) {
    return { base: spec.slice(0, triple), head: spec.slice(triple + 3) };
  }
  const dbl = spec.indexOf('..');
  if (dbl >= 0) {
    return { base: spec.slice(0, dbl), head: spec.slice(dbl + 2) };
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

/** GitHub commit API 응답 — 필요한 필드만. */
interface RawCommitMeta {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; email?: string };
  };
  author?: { login?: string } | null;
  parents?: Array<{ sha?: string }>;
}

/** GitHub compare API 응답 — 필요한 필드만. */
interface RawCompareMeta {
  html_url?: string;
  commits?: Array<{
    sha?: string;
    commit?: { author?: { name?: string } };
    author?: { login?: string } | null;
  }>;
}

/**
 * GitHub REST API로 단일 commit 메타 + diff 를 가져온다.
 * PR 없는 1인 개발자 워크플로우 지원 (main 직접 commit).
 *
 * @param parsed - parseCommitUrl 결과.
 * @param githubToken - 선택. 비어있으면 비인증 호출(rate limit 60/h).
 * @returns DiffPayload — pr_number=0 으로 표시.
 * @throws Error - 404(commit 미존재) / 401 / 403(rate limit) 등.
 */
export async function loadCommitFromGitHub(
  parsed: ParsedCommitUrl,
  githubToken?: string,
): Promise<DiffPayload> {
  const apiBase = `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/commits/${parsed.sha}`;
  const baseHeaders = buildHeaders(githubToken);

  // 1) 메타
  const metaRes = await fetch(apiBase, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github+json' },
  });
  await throwIfBad(metaRes, '커밋 메타');
  const metaJson = (await metaRes.json()) as RawCommitMeta;

  // 2) raw diff
  const diffRes = await fetch(apiBase, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github.v3.diff' },
  });
  await throwIfBad(diffRes, '커밋 diff');
  const rawDiffText = await diffRes.text();

  const message = metaJson.commit?.message ?? '';
  // 첫 줄을 title 로 (commit message 관례).
  const firstLine = message.split('\n', 1)[0] ?? '';
  const title = firstLine || `commit ${parsed.sha.slice(0, 7)}`;
  const parentSha = metaJson.parents?.[0]?.sha ?? '';
  const author = metaJson.author?.login ?? metaJson.commit?.author?.name ?? '';
  const fullSha = metaJson.sha ?? parsed.sha;
  const htmlUrl = metaJson.html_url ??
    `https://github.com/${parsed.owner}/${parsed.repo}/commit/${parsed.sha}`;

  const meta: PRMetadata = {
    title,
    author,
    base_ref: parentSha ? parentSha.slice(0, 7) : 'parent',
    head_ref: fullSha.slice(0, 7),
    html_url: htmlUrl,
    pr_number: 0, // PR 아님 — Result UI에서 분기 가능.
    body: message,
  };

  return buildPayload(rawDiffText, meta);
}

/**
 * GitHub REST API로 compare(base...head) 메타 + diff 를 가져온다.
 * 브랜치 비교 / 두 SHA 사이 변경분 분석에 사용.
 *
 * @param parsed - parseCompareUrl 결과.
 * @param githubToken - 선택. private repo / rate limit 회피 시 필요.
 * @returns DiffPayload — pr_number=0.
 * @throws Error - 404(ref 미존재) / 401 / 403 등.
 */
export async function loadCompareFromGitHub(
  parsed: ParsedCompareUrl,
  githubToken?: string,
): Promise<DiffPayload> {
  // base/head 는 ref 명 — 슬래시 포함 가능. '...' 구분자는 인코딩 금지.
  const baseEnc = encodeURIComponent(parsed.base);
  const headEnc = encodeURIComponent(parsed.head);
  const apiUrl =
    `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/compare/${baseEnc}...${headEnc}`;
  const baseHeaders = buildHeaders(githubToken);

  // 1) 메타
  const metaRes = await fetch(apiUrl, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github+json' },
  });
  await throwIfBad(metaRes, 'compare 메타');
  const metaJson = (await metaRes.json()) as RawCompareMeta;

  // 2) raw diff
  const diffRes = await fetch(apiUrl, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github.v3.diff' },
  });
  await throwIfBad(diffRes, 'compare diff');
  const rawDiffText = await diffRes.text();

  const commits = metaJson.commits ?? [];
  const lastCommit = commits.length > 0 ? commits[commits.length - 1] : undefined;
  const author =
    lastCommit?.author?.login ?? lastCommit?.commit?.author?.name ?? '비교 보기';
  const htmlUrl = metaJson.html_url ??
    `https://github.com/${parsed.owner}/${parsed.repo}/compare/${parsed.base}...${parsed.head}`;

  const meta: PRMetadata = {
    title: `Compare ${parsed.base}...${parsed.head}`,
    author,
    base_ref: parsed.base,
    head_ref: parsed.head,
    html_url: htmlUrl,
    pr_number: 0,
    body: commits.length > 0 ? `${commits.length}개 커밋 비교` : '',
  };

  return buildPayload(rawDiffText, meta);
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

/**
 * Repo의 default branch에서 최근 commit 목록을 가져온다.
 * PR 0건 fallback — 1인 개발자가 main 직접 commit하는 워크플로우 지원.
 *
 * @param owner - 'ssallem'
 * @param repo - 'ssallem.github.io'
 * @param token - 선택. private repo 또는 rate limit 회피 시 필요.
 * @param perPage - 1~100 (기본 10). 범위 밖이면 클램프됨.
 * @param branch - 선택. 미지정 시 GitHub default branch 사용.
 * @returns CommitSummary 배열 — committer.date 내림차순(GitHub 기본).
 * @throws Error - 401/403/404 및 rate limit (listPRs 와 동일 처리).
 */
export async function listRecentCommits(
  owner: string,
  repo: string,
  token?: string,
  perPage: number = 10,
  branch?: string,
): Promise<CommitSummary[]> {
  const clamped = Math.max(1, Math.min(100, Math.floor(perPage)));
  const params = new URLSearchParams({ per_page: String(clamped) });
  if (branch) params.set('sha', branch);

  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?${params.toString()}`;
  const headers = {
    ...buildHeaders(token),
    Accept: 'application/vnd.github+json',
  };

  const res = await fetch(url, { headers });
  await throwIfBad(res, '커밋 목록');
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('GitHub 커밋 목록 응답이 배열이 아닙니다.');
  }

  return raw.map(toCommitSummary).filter((v): v is CommitSummary => v !== null);
}

/** GitHub commit list element → CommitSummary 변환. 필수 필드(sha) 누락 시 null. */
function toCommitSummary(item: unknown): CommitSummary | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;

  const sha = typeof r.sha === 'string' ? r.sha : '';
  if (!sha) return null;

  const commit = r.commit as
    | { message?: unknown; author?: { name?: unknown; email?: unknown; date?: unknown }; committer?: { date?: unknown } }
    | undefined;
  const ghAuthor = r.author as { login?: unknown } | null | undefined;

  const fullMessage = typeof commit?.message === 'string' ? commit.message : '';
  // 첫 줄만 — 제목(subject) 추출.
  const firstLine = fullMessage.split('\n', 1)[0] ?? '';
  const message = firstLine || `(빈 커밋 메시지)`;

  // GitHub user login 우선, 없으면 commit.author.name fallback.
  const loginRaw = ghAuthor && typeof ghAuthor.login === 'string' ? ghAuthor.login : '';
  const commitAuthorName =
    typeof commit?.author?.name === 'string' ? commit.author.name : '';
  const author = loginRaw || commitAuthorName || '익명';

  const authorEmail =
    typeof commit?.author?.email === 'string' ? commit.author.email : undefined;

  // committer.date 우선 (HEAD 순서와 일치), 없으면 author.date.
  const committerDate =
    typeof commit?.committer?.date === 'string' ? commit.committer.date : '';
  const authorDate =
    typeof commit?.author?.date === 'string' ? commit.author.date : '';
  const date = committerDate || authorDate || '';

  const htmlUrl = typeof r.html_url === 'string' ? r.html_url : '';

  return {
    sha,
    short_sha: sha.slice(0, 7),
    message,
    full_message: fullMessage,
    author,
    author_email: authorEmail,
    date,
    html_url: htmlUrl,
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
  if (status === 404) {
    throw new Error(`${kind} not found (404): URL 또는 접근 권한을 확인하세요`);
  }
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
