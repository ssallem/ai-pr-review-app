/**
 * useSecretState — 시크릿(API 키 / GitHub 토큰) CRUD 상태 훅.
 *
 * Settings.tsx 본문 비대화 방지용으로 추출.
 *  - 초기 로드: getter() 로 저장된 시크릿을 마스킹 형태로 가져옴.
 *  - save: validator 통과 → setter() 호출 → 마스킹 업데이트.
 *  - remove: confirm 후 deleter() 호출 → 마스킹 초기화.
 *
 * 메시지/에러는 상위에서 onSuccess/onValidationError 콜백으로 받아 처리.
 */
import { useEffect, useState } from 'react';

interface Options {
  /** OS keychain 에서 시크릿을 읽는 storage 함수. */
  getter: () => Promise<string | null>;
  /** OS keychain 에 저장하는 storage 함수. */
  setter: (value: string) => Promise<void>;
  /** OS keychain 에서 삭제하는 storage 함수. */
  deleter: () => Promise<void>;
  /** 저장 전 검증 (예: API 키 prefix). 실패 시 onValidationError 호출. */
  validate?: (value: string) => string | null;
  /** confirm 메시지 — 삭제 시 사용자에게 표시. 빈 문자열이면 confirm 없이 즉시 삭제. */
  confirmDeleteMessage: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

interface Api {
  /** 마스킹된 현재 시크릿. 미설정 시 빈 문자열. */
  masked: string;
  hasSaved: boolean;
  save: (value: string) => Promise<void>;
  remove: () => Promise<void>;
}

export function useSecretState(opts: Options): Api {
  const { getter, setter, deleter, validate, confirmDeleteMessage, onSuccess, onError } = opts;
  const [masked, setMasked] = useState<string>('');

  useEffect(() => {
    void getter().then((v) => setMasked(v !== null && v !== '' ? mask(v) : ''));
  }, [getter]);

  const save = async (value: string): Promise<void> => {
    if (validate !== undefined) {
      const err = validate(value);
      if (err !== null) {
        onError?.(err);
        return;
      }
    }
    try {
      await setter(value);
      setMasked(mask(value));
      onSuccess?.('저장됐습니다.');
    } catch (e) {
      onError?.(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (): Promise<void> => {
    if (confirmDeleteMessage !== '' && !confirm(confirmDeleteMessage)) return;
    await deleter();
    setMasked('');
    onSuccess?.('삭제됐습니다.');
  };

  return { masked, hasSaved: masked !== '', save, remove };
}

/** 시크릿 마스킹: 앞 8자 + ... + 뒤 4자. 12자 미만은 *** 만 노출. */
function mask(value: string): string {
  if (value.length < 12) return '***';
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
