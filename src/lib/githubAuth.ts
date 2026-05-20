/**
 * GitHub Device Flow OAuth 인증.
 *
 * 흐름:
 *   1) startDeviceFlow() → device_code + user_code (8자리) + verification_uri.
 *   2) 사용자에게 user_code 표시 + 브라우저 자동 열기.
 *   3) pollForToken() 으로 interval 마다 access_token 폴링.
 *   4) 성공 시 keychain(storage.setGithubToken)에 저장.
 *
 * GitHub CLI(`gh auth login`)와 동일한 패턴. PAT 발급 마찰 제거.
 *
 * 시스템 경계 검증:
 *   - GitHub 응답은 unknown 으로 받고, 필수 필드만 골라 타입 좁힘.
 *   - 모든 에러는 한국어 메시지로 사용자에게 전달.
 *
 * 시크릿(token)은 절대 console/localStorage 등에 평문으로 남기지 않는다.
 */

// Tauri 2 plugin-http: GitHub login/oauth 엔드포인트는 CORS 헤더 미발급 → 글로벌 fetch 차단됨.
// plugin-http 는 Rust 계층에서 대신 호출하므로 CORS 우회. capabilities/default.json 에 호스트 화이트리스트 필요.
import { fetch } from '@tauri-apps/plugin-http';

import { setGithubToken } from './storage';

// FirstNode OAuth App "AI PR Review Toolkit" (ssallem 계정 소유)
// GitHub Settings → Developer settings → OAuth Apps
// Device Flow 활성. Client ID는 공개 비밀이라 hardcode 안전.
const CLIENT_ID = 'Ov23littLq71hbX1kPsX';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Device Flow 시작 후 사용자에게 노출할 정보. */
export interface DeviceFlowStart {
  device_code: string;
  /** 8자리 사용자 입력 코드 (예: "WDJB-MJHT"). */
  user_code: string;
  /** 보통 'https://github.com/login/device'. */
  verification_uri: string;
  /** 만료까지 남은 초. 보통 900. */
  expires_in: number;
  /** 폴링 주기(초). 보통 5. slow_down 시 가산. */
  interval: number;
}

/** /login/oauth/access_token 응답 — 성공 또는 에러. */
interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?:
    | 'authorization_pending'
    | 'slow_down'
    | 'expired_token'
    | 'unsupported_grant_type'
    | 'incorrect_client_credentials'
    | 'incorrect_device_code'
    | 'access_denied'
    | 'device_flow_disabled';
  error_description?: string;
}

/** pollForToken 진행 상태 콜백에 전달되는 상태값. */
export type PollStatus = 'polling' | 'slow_down';

/**
 * Device Flow 시작 — 사용자에게 표시할 user_code + verification_uri 반환.
 *
 * @param scope - 기본 'repo' (private repo 접근). 공개 PR만 다루면 'public_repo' 가능.
 * @throws Error - 네트워크 오류 / GitHub 응답 형식 불일치 / OAuth App 미설정.
 */
export async function startDeviceFlow(scope: string = 'repo'): Promise<DeviceFlowStart> {
  const resp = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: CLIENT_ID, scope }),
  });

  if (!resp.ok) {
    throw new Error(`Device code 요청 실패: ${resp.status} ${resp.statusText}`);
  }

  const raw: unknown = await resp.json();
  if (!raw || typeof raw !== 'object') {
    throw new Error('GitHub 응답이 JSON 객체가 아닙니다.');
  }
  const data = raw as Record<string, unknown>;

  if (typeof data.error === 'string') {
    const desc = typeof data.error_description === 'string' ? data.error_description : data.error;
    throw new Error(`GitHub: ${desc}`);
  }

  if (
    typeof data.device_code !== 'string' ||
    typeof data.user_code !== 'string' ||
    typeof data.verification_uri !== 'string' ||
    typeof data.expires_in !== 'number' ||
    typeof data.interval !== 'number'
  ) {
    throw new Error('GitHub 응답에 필수 필드가 없습니다. OAuth App "Device Flow" 활성화를 확인하세요.');
  }

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: data.interval,
  };
}

/**
 * Access token 폴링. 성공 시 keychain(setGithubToken)에 저장 + 반환.
 *
 * @param flow - startDeviceFlow 결과.
 * @param onProgress - 폴링 진행 알림 (남은 시간 / slow_down 상태).
 * @param signal - AbortSignal — 사용자 취소.
 * @returns access_token 문자열.
 * @throws Error - 만료 / 거부 / 네트워크 / 사용자 취소.
 */
export async function pollForToken(
  flow: DeviceFlowStart,
  onProgress?: (status: PollStatus, remainingSec: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  let interval = flow.interval;
  const startTime = Date.now();
  const expiresAt = startTime + flow.expires_in * 1000;

  while (Date.now() < expiresAt) {
    throwIfAborted(signal);

    await sleep(interval * 1000, signal);

    throwIfAborted(signal);

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: flow.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = (await resp.json()) as TokenResponse;

    if (typeof data.access_token === 'string' && data.access_token.length > 0) {
      await setGithubToken(data.access_token);
      return data.access_token;
    }

    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

    if (data.error === 'authorization_pending') {
      onProgress?.('polling', remaining);
      continue;
    }

    if (data.error === 'slow_down') {
      interval += 5;
      onProgress?.('slow_down', remaining);
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('인증 시간이 초과됐습니다. 다시 시작해주세요.');
    }

    if (data.error === 'access_denied') {
      throw new Error('인증이 거부됐습니다.');
    }

    if (data.error === 'device_flow_disabled') {
      throw new Error(
        'Device Flow가 OAuth App에 비활성화돼 있습니다. GitHub OAuth App 설정에서 "Enable Device Flow"를 체크하세요.',
      );
    }

    if (data.error === 'incorrect_client_credentials') {
      throw new Error('Client ID가 잘못됐습니다. 앱 설정의 OAuth Client ID를 확인하세요.');
    }

    if (data.error === 'incorrect_device_code') {
      throw new Error('Device code가 유효하지 않습니다. 다시 시작해주세요.');
    }

    if (data.error === 'unsupported_grant_type') {
      throw new Error('grant_type 이 지원되지 않습니다. 클라이언트 구현을 확인하세요.');
    }

    throw new Error(`GitHub OAuth 오류: ${data.error_description ?? data.error ?? '알 수 없음'}`);
  }

  throw new Error('인증 시간이 초과됐습니다.');
}

/** signal aborted 면 즉시 에러. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('사용자가 취소했습니다.');
  }
}

/** AbortSignal 지원 sleep — abort 시 즉시 reject. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('사용자가 취소했습니다.'));
        },
        { once: true },
      );
    }
  });
}
