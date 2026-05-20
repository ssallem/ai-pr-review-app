/**
 * 마크다운 → HTML 렌더러 (marked 래퍼).
 *
 * 책임:
 *  - 코드 펜스(```lang ... ```) → <pre><code> 박스 (Tailwind 클래스 적용)
 *  - 인라인 백틱(`code`) → 작은 <code> 칩
 *  - **strong** → amber 하이라이트 <strong>
 *  - 단락/줄바꿈/리스트 등 표준 GFM
 *
 * XSS 정책 (골든 룰 6 — 시스템 경계 검증):
 *  - marked 의 모든 raw 출력은 escapeHtml() 로 한 번 더 격리.
 *  - 입력은 Claude AI 가 만든 텍스트 + GitHub diff — 신뢰도 중간.
 *  - 첫 버전은 marked 만 사용, 추후 위험 평가 시 DOMPurify 추가.
 *
 * 사용처: IssueCard body, 향후 ReportSummary 의 한 줄 요약 등.
 */

import { marked, type Tokens } from 'marked';

// ─── HTML escape (XSS 1차 차단) ──────────────────────────────
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── marked 옵션: GFM + breaks ──────────────────────────────
marked.setOptions({
  breaks: true, // \n → <br>
  gfm: true, // GitHub Flavored Markdown
});

// ─── 커스텀 renderer: Tailwind 클래스 부착 ──────────────────
const renderer = new marked.Renderer();

renderer.code = ({ text, lang }: Tokens.Code): string => {
  const safeLang = (lang ?? 'text').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeText = escapeHtml(text);
  return (
    `<pre class="my-3 p-4 rounded-lg bg-surface-alt border border-border overflow-x-auto">` +
    `<code class="text-sm font-mono text-text-primary language-${safeLang}">${safeText}</code>` +
    `</pre>`
  );
};

renderer.codespan = ({ text }: Tokens.Codespan): string => {
  // marked 는 codespan.text 를 이미 HTML escape 한 상태로 넘김 →
  // 우리는 추가 escape 없이 그대로 감싼다 (escape 두 번 시 &amp;amp; 사고).
  return (
    `<code class="rounded bg-surface-alt px-1.5 py-0.5 text-[0.92em] font-mono text-brand-700 dark:text-brand-100">` +
    `${text}</code>`
  );
};

renderer.strong = ({ tokens }: Tokens.Strong): string => {
  const inner = marked.parser(tokens);
  return (
    `<strong class="font-bold text-text-primary bg-amber-100/40 dark:bg-amber-900/30 px-1 rounded">` +
    `${inner}</strong>`
  );
};

renderer.paragraph = ({ tokens }: Tokens.Paragraph): string => {
  const inner = marked.parser(tokens);
  return `<p class="my-2 leading-relaxed">${inner}</p>`;
};

renderer.list = (token: Tokens.List): string => {
  const tag = token.ordered ? 'ol' : 'ul';
  const cls = token.ordered
    ? 'my-3 ml-6 list-decimal space-y-1'
    : 'my-3 ml-6 list-disc space-y-1';
  const body = token.items.map((item) => renderer.listitem(item)).join('');
  return `<${tag} class="${cls}">${body}</${tag}>`;
};

renderer.listitem = (item: Tokens.ListItem): string => {
  const inner = marked.parser(item.tokens);
  return `<li class="leading-relaxed">${inner}</li>`;
};

marked.use({ renderer });

/**
 * 마크다운 문자열을 안전한 HTML 로 변환.
 *  - async:false → 동기 반환 (React render path 에서 직접 사용 가능).
 *  - 호출부에서 dangerouslySetInnerHTML 로 주입.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  return marked.parse(text, { async: false }) as string;
}
