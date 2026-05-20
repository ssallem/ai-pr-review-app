/**
 * 리뷰 진행 중 전용 화면.
 *
 * 사용자가 PR 분석 시작 후 "리뷰 진행 중... (3~5분)" 한 줄만 보여 멈춰있다고 오해하던
 * UX 버그를 해결하기 위한 별도 컴포넌트. App.tsx 의 screen === 'reviewing' 분기에서
 * Input 대신 렌더된다.
 *
 * 책임:
 *  - 단계별 timeline 표시 (fetching → parsing → analyzing → finishing).
 *  - 경과 시간 1초마다 갱신 — "멈춰있나" 의심 차단.
 *  - 분석 대상(repo / PR title / URL) 상단에 강조 — "어떤 작업이 진행 중인가" 명확.
 *  - 파일 수 + 변경 LOC + 분석 중 파일 목록(최대 12개) 표시 — 진행감 보조.
 *  - 선택적 취소 버튼 (현 버전에서는 App.tsx 에서 미사용).
 *
 * 의도적 비포함:
 *  - 실시간 Claude streaming token 표시 — 현 reviewer.ts 는 비-streaming.
 *  - 진행률 % 게이지 — Claude 호출은 black-box 라 단계 + 경과 시간만 정직하게 표시.
 */
import { useEffect, useState, type FC } from 'react';

/** App.tsx 가 set 하는 단계별 진행 상태. */
export interface ReviewProgress {
  stage: 'fetching' | 'parsing' | 'analyzing' | 'finishing';
  /** 사용자에게 보여줄 한국어 보조 메시지. */
  message: string;
  /** diff 파일 수 (parsing 단계 이후). */
  fileCount?: number;
  /** 변경 LOC 합계 (parsing 단계 이후). */
  totalLOC?: number;
  /** 분석 중 파일 이름들 (최대 12개 표시). */
  filenames?: string[];
}

interface Props {
  /** 현재 분석 중인 PR / commit 제목. diff fetch 직후 부모가 set. */
  prTitle?: string;
  /** 원본 URL — 사용자가 어떤 링크를 넣었는지 재확인. */
  prUrl?: string;
  /** 'owner/repo' — 어느 저장소를 분석 중인지 한눈에. */
  repoName?: string;
  progress: ReviewProgress;
  /** 옵션 — 사용자가 분석 취소. 현재 App.tsx 에서 미전달. */
  onCancel?: () => void;
}

interface StageDef {
  key: ReviewProgress['stage'];
  label: string;
}

const STAGES: readonly StageDef[] = [
  { key: 'fetching', label: 'GitHub diff 가져오는 중' },
  { key: 'parsing', label: 'diff 분석 중' },
  { key: 'analyzing', label: 'Claude AI 코드 리뷰 작성 중' },
  { key: 'finishing', label: '결과 정리 중' },
] as const;

const Reviewing: FC<Props> = ({ prTitle, prUrl, repoName, progress, onCancel }) => {
  const [elapsedSec, setElapsedSec] = useState(0);

  // 1초마다 경과 시간 카운트 — "정지 의심" 차단의 핵심 시각 신호.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentIndex = STAGES.findIndex((s) => s.key === progress.stage);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* 분석 대상 정보 — 어떤 작업이 진행 중인지 명확히. */}
      {(repoName !== undefined || prTitle !== undefined) && (
        <section className="mb-8 p-6 rounded-2xl bg-surface-alt border border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500 mb-2">
            분석 중
          </p>
          {repoName !== undefined && (
            <p className="text-sm font-mono text-text-secondary mb-1">📦 {repoName}</p>
          )}
          {prTitle !== undefined && (
            <h2 className="text-lg sm:text-xl font-bold text-text-primary break-words">
              {prTitle}
            </h2>
          )}
          {prUrl !== undefined && (
            <p className="mt-2 text-xs font-mono text-text-muted break-all">{prUrl}</p>
          )}
        </section>
      )}

      {/* 단계 timeline — 사용자가 "어디까지 왔나" 파악. */}
      <section className="mb-8" aria-label="리뷰 단계 진행 상황">
        <ol className="space-y-3">
          {STAGES.map((stage, idx) => {
            const isCurrent = idx === currentIndex;
            const isDone = idx < currentIndex;
            return (
              <li key={stage.key} className="flex items-center gap-3">
                <div
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-brand-500 text-white animate-pulse'
                        : 'bg-surface-alt text-text-muted'
                  }`}
                  aria-hidden="true"
                >
                  {isDone ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-sm ${
                    isCurrent
                      ? 'font-bold text-text-primary'
                      : isDone
                        ? 'text-text-secondary line-through'
                        : 'text-text-muted'
                  }`}
                >
                  {stage.label}
                  {isCurrent && progress.message !== '' && (
                    <span className="ml-2 text-text-secondary font-normal">
                      — {progress.message}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 메타 카드 — 경과 시간 · 파일 수 · LOC. */}
      <section className="mb-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-lg bg-surface border border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-1">
            경과 시간
          </p>
          <p className="text-2xl font-extrabold text-brand-500 tabular-nums">
            {formatTime(elapsedSec)}
          </p>
        </div>
        {progress.fileCount !== undefined && (
          <div className="p-4 rounded-lg bg-surface border border-border">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-1">
              파일
            </p>
            <p className="text-2xl font-extrabold text-text-primary tabular-nums">
              {progress.fileCount}
            </p>
          </div>
        )}
        {progress.totalLOC !== undefined && (
          <div className="p-4 rounded-lg bg-surface border border-border">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-1">
              변경 LOC
            </p>
            <p className="text-2xl font-extrabold text-text-primary tabular-nums">
              ~{progress.totalLOC.toLocaleString()}
            </p>
          </div>
        )}
      </section>

      {/* 분석 중 파일 목록 — 진행감 보조 (parsing 단계 이후 표시). */}
      {progress.filenames !== undefined && progress.filenames.length > 0 && (
        <section className="mb-8" aria-label="분석 중 파일 목록">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">
            분석 중 파일
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-3">
            {progress.filenames.slice(0, 12).map((f) => (
              <li key={f} className="text-xs font-mono text-text-secondary truncate">
                <span className="text-text-muted">📄 </span>
                {f}
              </li>
            ))}
            {progress.filenames.length > 12 && (
              <li className="text-xs text-text-muted italic">
                + {progress.filenames.length - 12}개 더
              </li>
            )}
          </ul>
        </section>
      )}

      {/* 안내 + 선택적 취소. */}
      <section className="text-center">
        <p className="text-sm text-text-secondary mb-4 leading-relaxed">
          Claude AI가 시니어 개발자 관점에서 분석 중입니다.
          <br />
          보통 <strong className="text-text-primary">3~5분</strong> 소요됩니다. 창을 닫지
          마세요.
        </p>
        {onCancel !== undefined && progress.stage !== 'finishing' && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-text-muted hover:text-severity-critical hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-severity-critical rounded"
          >
            취소 (지금까지 사용한 토큰은 환불되지 않음)
          </button>
        )}
      </section>
    </div>
  );
};

/** 초 → "M분 S초" 또는 "S초" 한국어 표기. */
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

export default Reviewing;
