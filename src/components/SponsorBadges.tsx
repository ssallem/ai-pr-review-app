/**
 * SponsorBadges — 2채널 후원 배지.
 *
 * - GitHub Sponsors / 카카오페이 QR. (글로벌 결제 채널은 한국 계좌 비호환으로 제거)
 * - 외부 링크는 Tauri plugin-opener 의 openUrl 로 OS 기본 브라우저에서 열림.
 * - 카카오페이는 QR 모달 — 이미지는 public/kakaopay-qr.png 에 사용자가 직접 업로드.
 * - 모달 닫기: 배경 클릭 / Esc / X 버튼.
 *
 * 정책:
 *  - 이모지(❤️ 📱)는 시각적 라벨 — 글로벌 룰 예외.
 *  - 접근성: role="dialog" + aria-label + focus-visible ring.
 *  - QR 이미지 없을 때 onError fallback 으로 안내 텍스트 노출.
 *  - 2채널이라 카드를 더 크게 + 아이콘/제목 임팩트 ↑.
 */
import { useEffect, useState, type FC } from 'react';

import { openUrl } from '@tauri-apps/plugin-opener';

const SponsorBadges: FC = () => {
  const [showQrModal, setShowQrModal] = useState(false);

  // Esc 키로 모달 닫기.
  useEffect(() => {
    if (!showQrModal) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowQrModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showQrModal]);

  const open = async (url: string): Promise<void> => {
    try {
      await openUrl(url);
    } catch (e) {
      // openUrl 실패 시 콘솔 로깅만 — 사용자에게는 별도 알림 없이 silent fail.
      console.error('openUrl 실패:', e);
    }
  };

  return (
    <section className="my-8 rounded-2xl border border-border bg-surface-alt p-6 sm:p-8">
      <h3 className="text-lg font-bold text-text-primary mb-2">💝 이 도구가 마음에 드시나요?</h3>
      <p className="text-sm text-text-secondary dark:text-text-primary mb-5">
        자발적 후원으로 다음 기능 개발에 힘을 보태주세요. 모두 무료이지만 후원자 명단은 README에 게시됩니다.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* GitHub Sponsors */}
        <button
          type="button"
          onClick={() => void open('https://github.com/sponsors/ssallem')}
          className="flex flex-col items-start gap-2 p-5 sm:p-6 rounded-xl border-2 border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-900/30 hover:bg-pink-100 dark:hover:bg-pink-900/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="text-3xl" aria-hidden="true">❤️</span>
          <span className="text-base font-bold text-pink-700 dark:text-pink-100">GitHub Sponsors</span>
          <span className="text-xs text-text-secondary dark:text-text-primary">개발자 친화 글로벌 후원 채널</span>
        </button>

        {/* 카카오페이 송금 QR */}
        <button
          type="button"
          onClick={() => setShowQrModal(true)}
          className="flex flex-col items-start gap-2 p-5 sm:p-6 rounded-xl border-2 border-yellow-400 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2"
        >
          <span className="text-3xl" aria-hidden="true">📱</span>
          <span className="text-base font-bold text-yellow-800 dark:text-yellow-100">카카오페이 송금</span>
          <span className="text-xs text-text-secondary dark:text-text-primary">국내 송금 QR 코드 보기</span>
        </button>
      </div>

      {showQrModal && <KakaoPayQrModal onClose={() => setShowQrModal(false)} />}
    </section>
  );
};

/**
 * 카카오페이 QR 모달 — public/kakaopay-qr.png 로드.
 *  - 이미지 없을 때 onError 로 fallback 안내 노출.
 *  - 배경 클릭 / X 버튼으로 닫기. Esc 는 부모에서 처리.
 *  - 2채널이 된 만큼 QR 크기를 max-w-md 로 살짝 키움.
 */
const KakaoPayQrModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      role="dialog"
      aria-label="카카오페이 송금 QR"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-text-primary">카카오페이로 송금</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-text-muted hover:text-text-primary text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            ✕
          </button>
        </div>

        {imgFailed ? (
          <div className="w-full aspect-square rounded-lg bg-surface-alt flex flex-col items-center justify-center text-center p-6 gap-2">
            <span className="text-4xl" aria-hidden="true">📱</span>
            <p className="text-sm text-text-secondary">
              QR 이미지 준비 중<br />
              카카오톡 → 프로필 → 송금 → QR로 받기에서<br />
              캡처한 PNG를{' '}
              <code className="text-xs">public/kakaopay-qr.png</code>로<br />
              업로드해주세요.
            </p>
          </div>
        ) : (
          <img
            src="/kakaopay-qr.png"
            alt="카카오페이 송금 QR 코드"
            className="w-full aspect-square rounded-lg object-contain bg-white"
            onError={() => setImgFailed(true)}
          />
        )}

        <p className="mt-4 text-xs text-text-secondary text-center">
          카카오톡에서 QR 스캔 → 송금
        </p>
      </div>
    </div>
  );
};

export default SponsorBadges;
