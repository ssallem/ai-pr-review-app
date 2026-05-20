/**
 * 마크다운 → HTML 변환.
 * marked 기본 파서 사용 + Tailwind 스타일은 wrapper의 .markdown-body 클래스로.
 *
 * 변경 이력:
 *  - 2026-05-21: marked v18 호환성 fix. 커스텀 renderer(paragraph/strong/listitem)
 *    내부에서 marked.parser(tokens) 호출 시 시그니처 불일치로 throw → 하얀 화면.
 *    모든 커스텀 renderer 제거 + 기본 marked.parse만 사용. 스타일은 CSS 클래스로.
 */
import { marked } from 'marked';

marked.use({
  breaks: true, // \n → <br>
  gfm: true, // GitHub Flavored
});

/**
 * 마크다운 문자열 → HTML.
 * IssueCard 등에서 사용. XSS 안전 위해 신뢰할 수 있는 입력만 (Claude 응답).
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  const result = marked.parse(text, { async: false });
  return typeof result === 'string' ? result : '';
}
