/**
 * AIPromptSection — 리뷰 결과를 Claude Code / Codex CLI / 일반 AI 챗봇에
 * 붙여넣어 "자동 수정"을 요청할 수 있는 프롬프트 문자열로 직렬화.
 *
 * - 도구별 톤 차이만 toggle 로 노출 (헤더/우선순위 안내).
 * - severity 그룹(CRITICAL → WARNING → SUGGESTION) + file:line + suggested_fix.
 * - 클립보드 복사 + 2초 후 자동 복귀.
 * - 이슈 0건이면 호출부에서 렌더 자체를 스킵.
 */

import { useState, type FC } from 'react';
import type { ReviewIssue, ReviewResult, Severity } from '../../lib/reviewer';

type Tool = 'claude-code' | 'codex' | 'generic';

interface Props {
  result: ReviewResult;
  prTitle?: string;
  repoName?: string;
  prUrl?: string;
}

const AIPromptSection: FC<Props> = ({ result, prTitle, repoName, prUrl }) => {
  const [copied, setCopied] = useState(false);
  const [tool, setTool] = useState<Tool>('claude-code');

  const prompt = buildPrompt(result, { prTitle, repoName, prUrl, tool });

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // 클립보드 거부(권한/HTTPS 부재) 시 콘솔에만 남기고 UI 는 무변경.
      // Tauri 환경에서는 기본 허용되지만 방어적으로 처리.
      console.error('clipboard copy failed', e);
    }
  };

  return (
    <section className="my-8 rounded-2xl border-2 border-brand-500 dark:border-brand-700 bg-gradient-to-br from-brand-50 via-surface to-surface-alt dark:from-brand-900/20 dark:via-surface dark:to-surface-alt p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-brand-100 mb-1">
            AI 수정 요청 프롬프트
          </p>
          <h2 className="text-xl font-bold text-text-primary">
            복사해서 Claude Code 또는 Codex 에 붙여넣으세요
          </h2>
        </div>

        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`shrink-0 px-4 py-2 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-brand-500 hover:bg-brand-600 text-white'
          }`}
        >
          {copied ? '✓ 복사됨!' : '클립보드에 복사'}
        </button>
      </div>

      {/* 도구 선택 토글 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['claude-code', 'codex', 'generic'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTool(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              tool === t
                ? 'bg-brand-500 text-white'
                : 'bg-surface border border-border text-text-secondary hover:bg-surface-alt'
            }`}
          >
            {t === 'claude-code' ? 'Claude Code' : t === 'codex' ? 'Codex CLI' : '일반 AI'}
          </button>
        ))}
      </div>

      {/* 프롬프트 미리보기 */}
      <pre className="p-4 rounded-lg bg-surface border border-border overflow-auto text-xs font-mono text-text-primary whitespace-pre-wrap max-h-96">
        {prompt}
      </pre>

      <p className="mt-3 text-xs text-text-secondary">
        위 프롬프트를 복사 → 본인 PC 의 Claude Code 또는 Codex CLI 에 붙여넣기 → 자동 수정.
      </p>
    </section>
  );
};

// ─────────── 프롬프트 빌더 ───────────

interface BuildCtx {
  prTitle?: string;
  repoName?: string;
  prUrl?: string;
  tool: Tool;
}

function buildPrompt(result: ReviewResult, ctx: BuildCtx): string {
  const lines: string[] = [];

  // 도구별 헤더 — 톤 차이만 줌.
  if (ctx.tool === 'claude-code') {
    lines.push('아래 PR 리뷰에서 발견된 이슈를 수정해줘.');
  } else if (ctx.tool === 'codex') {
    lines.push('Please fix the following issues found in PR review:');
  } else {
    lines.push('다음 PR 리뷰에서 발견된 이슈를 수정해주세요.');
  }
  lines.push('');

  // 컨텍스트 — repo / 제목 / URL.
  if (
    (ctx.repoName !== undefined && ctx.repoName !== '') ||
    (ctx.prTitle !== undefined && ctx.prTitle !== '')
  ) {
    lines.push('## 대상');
    if (ctx.repoName !== undefined && ctx.repoName !== '') {
      lines.push(`- Repository: ${ctx.repoName}`);
    }
    if (ctx.prTitle !== undefined && ctx.prTitle !== '') {
      lines.push(`- 제목: ${ctx.prTitle}`);
    }
    if (ctx.prUrl !== undefined && ctx.prUrl !== '') {
      lines.push(`- URL: ${ctx.prUrl}`);
    }
    lines.push('');
  }

  // 한 줄 요약.
  if (result.summary !== '') {
    lines.push('## 핵심 요약');
    lines.push(result.summary);
    lines.push('');
  }

  // severity 별 그룹화.
  const critical = result.issues.filter((i) => i.severity === 'CRITICAL');
  const warning = result.issues.filter((i) => i.severity === 'WARNING');
  const suggestion = result.issues.filter((i) => i.severity === 'SUGGESTION');

  appendIssues(lines, 'CRITICAL', critical, '반드시 수정');
  appendIssues(lines, 'WARNING', warning, '수정 권장');
  appendIssues(lines, 'SUGGESTION', suggestion, '선택적 개선');

  // 마무리 지시.
  lines.push('---');
  lines.push('');
  if (ctx.tool === 'claude-code') {
    lines.push(
      '우선순위 순서 (CRITICAL → WARNING → SUGGESTION) 로 수정하고, 각 수정마다 짧은 commit message 도 제안해줘.',
    );
  } else if (ctx.tool === 'codex') {
    lines.push(
      'Fix in priority order (CRITICAL → WARNING → SUGGESTION). Suggest a short commit message for each change.',
    );
  } else {
    lines.push('우선순위 순서 (CRITICAL → WARNING → SUGGESTION) 로 수정해주세요.');
  }

  return lines.join('\n');
}

function appendIssues(
  lines: string[],
  severity: Severity,
  issues: ReviewIssue[],
  priority: string,
): void {
  if (issues.length === 0) return;
  lines.push(`## ${severity} (${issues.length}건) — ${priority}`);
  lines.push('');
  issues.forEach((iss, idx) => {
    const location =
      iss.file !== undefined && iss.file !== ''
        ? `${iss.file}${iss.line !== undefined ? `:${iss.line}` : ''}`
        : iss.category;
    lines.push(`### ${idx + 1}. ${location}`);
    lines.push('');
    lines.push(iss.message);
    if (iss.suggested_fix !== undefined && iss.suggested_fix !== '') {
      lines.push('');
      lines.push('**제안 수정:**');
      lines.push(iss.suggested_fix);
    }
    lines.push('');
  });
}

export default AIPromptSection;
