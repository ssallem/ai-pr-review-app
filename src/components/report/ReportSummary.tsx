/**
 * ReportSummary — 리포트 통계 grid.
 *
 * - "이슈 분포 + 소요 시간" 4-cell horizontal grid.
 * - severity 별 그라데이션 배경 + 두꺼운 좌측 border + 큰 숫자 + uppercase 라벨.
 *
 * 원본: web/src/components/report/ReportSummary.astro (Phase 1-D-Components 포팅).
 */

import type { FC } from 'react';

interface Props {
  critical: number;
  warning: number;
  suggestion: number;
  duration_sec: number | null;
}

type Tone = 'critical' | 'warning' | 'suggestion' | 'neutral';

interface Stat {
  label: string;
  value: number | string;
  tone: Tone;
}

interface ToneClasses {
  card: string;
  border: string;
  value: string;
  label: string;
}

// severity 토큰은 CSS 변수라 Tailwind 투명도 변환이 어려움 →
// 라이트/다크 모두 안전한 고정 Tailwind 색(red/amber/sky/gray)으로 표현
const TONE_CLASSES: Record<Tone, ToneClasses> = {
  critical: {
    card: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/30 dark:to-red-950/50',
    border: 'border-l-severity-critical',
    value: 'text-severity-critical',
    label: 'text-red-700 dark:text-red-300',
  },
  warning: {
    card: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-950/50',
    border: 'border-l-severity-warning',
    value: 'text-severity-warning',
    label: 'text-amber-700 dark:text-amber-300',
  },
  suggestion: {
    card: 'bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-900/30 dark:to-sky-950/50',
    border: 'border-l-severity-suggestion',
    value: 'text-severity-suggestion',
    label: 'text-sky-700 dark:text-sky-300',
  },
  neutral: {
    card: 'bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-900/30 dark:to-gray-950/50',
    border: 'border-l-text-muted',
    value: 'text-text-primary',
    label: 'text-text-secondary',
  },
};

// 시간 포맷 — Astro 원본과 동일
function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}

const ReportSummary: FC<Props> = ({ critical, warning, suggestion, duration_sec }) => {
  const stats: Stat[] = [
    { label: 'CRITICAL', value: critical, tone: 'critical' },
    { label: 'WARNING', value: warning, tone: 'warning' },
    { label: 'SUGGESTION', value: suggestion, tone: 'suggestion' },
    { label: '소요 시간', value: formatDuration(duration_sec), tone: 'neutral' },
  ];

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm dark:shadow-none"
      aria-label="이슈 분포 통계"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-5">
        이슈 분포 + 소요 시간
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const t = TONE_CLASSES[stat.tone];
          return (
            <div
              key={stat.label}
              className={`relative overflow-hidden rounded-xl border-l-4 ${t.border} ${t.card} p-6 shadow-sm`}
            >
              <div className={`text-4xl sm:text-5xl font-extrabold leading-none mb-3 ${t.value}`}>
                {stat.value}
              </div>
              <div className={`text-xs font-bold uppercase tracking-widest ${t.label}`}>
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ReportSummary;
