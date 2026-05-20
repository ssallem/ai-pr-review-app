/**
 * Badge — severity / status / 카테고리 표시용 작은 라벨.
 *
 * - color 6종(brand / red / amber / sky / emerald / gray), size 2종(sm / md).
 * - 라이트·다크 모드 색상 매핑 포함.
 * - children 으로 라벨 텍스트를 받는다.
 *
 * 원본: web/src/components/ui/Badge.astro (Phase 1-D-Components 포팅).
 */

import type { FC, ReactNode } from 'react';

type BadgeColor = 'brand' | 'red' | 'amber' | 'sky' | 'emerald' | 'gray';
type BadgeSize = 'sm' | 'md';

interface Props {
  color?: BadgeColor;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}

// 공통 베이스 — pill 형태, 대문자, 글자간격
const BASE =
  'inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide';

const SIZES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

const COLORS: Record<BadgeColor, string> = {
  brand:
    'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  amber:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  emerald:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
};

const Badge: FC<Props> = ({
  color = 'gray',
  size = 'sm',
  className = '',
  children,
}) => {
  const cls = `${BASE} ${SIZES[size]} ${COLORS[color]} ${className}`.trim();
  return <span className={cls}>{children}</span>;
};

export default Badge;
