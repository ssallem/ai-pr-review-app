/**
 * SectionCard — Settings 화면의 각 섹션 컨테이너.
 *
 * 책임:
 *  - 일관된 카드 레이아웃 (border + bg-surface + padding).
 *  - title (h3) + description (optional) + children (실제 컨트롤).
 *
 * Settings.tsx 본문 가독성을 위해 분리. 다른 화면에서는 사용 안 함.
 */
import type { FC, ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

const SectionCard: FC<Props> = ({ title, description, children }) => {
  return (
    <section className="mb-8 p-6 rounded-xl border border-border bg-surface">
      <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
      {description !== undefined && (
        <p className="text-sm text-text-secondary mb-4">{description}</p>
      )}
      {children}
    </section>
  );
};

export default SectionCard;
