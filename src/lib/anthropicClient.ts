/**
 * Anthropic API 직접 호출 (fetch).
 * @anthropic-ai/sdk를 사용하지 않는다 — Node.js 전용 의존성이라 Vite production
 * 빌드에서 흰 화면 발생. REST endpoint는 단순하므로 직접 호출이 더 안전.
 *
 * Tauri plugin-http을 사용해 CORS 우회 (Rust 계층에서 fetch).
 */
import { fetch } from '@tauri-apps/plugin-http';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** 사용자가 전달하는 message content block. system은 prompt caching 가능. */
export interface MessageContent {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface MessagesRequest {
  model: string;
  max_tokens: number;
  /** prompt caching을 활용하려면 [{ type, text, cache_control }] 배열 형태로. */
  system: string | MessageContent[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface MessagesResponse {
  content: Array<{ type: 'text'; text: string }>;
  usage: Usage;
  stop_reason: string;
}

/**
 * Anthropic Messages API 호출.
 *
 * @throws Error - 401(인증 실패) / 429(rate limit) / 500(서버 오류) / 네트워크.
 */
export async function callAnthropicMessages(
  apiKey: string,
  body: MessagesRequest,
): Promise<MessagesResponse> {
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    throw new Error('API 키가 유효하지 않습니다 (sk-ant-... 형식이어야 합니다)');
  }

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let errorMsg = `Anthropic API 오류 ${resp.status}`;
    try {
      const errData = await resp.json() as { error?: { message?: string; type?: string } };
      if (errData?.error?.message) {
        errorMsg += `: ${errData.error.message}`;
      }
    } catch {
      // JSON 파싱 실패는 무시 - status text만 사용
    }
    if (resp.status === 401) errorMsg += ' (API 키 확인 필요)';
    if (resp.status === 429) errorMsg += ' (사용량 한도 초과)';
    throw new Error(errorMsg);
  }

  const data = await resp.json() as MessagesResponse;
  if (!data.content || !Array.isArray(data.content)) {
    throw new Error('Anthropic 응답 형식 오류');
  }
  return data;
}

/**
 * Convenience helper — system + user prompt만 받아서 응답 text 반환.
 * prompt caching 자동 적용 (system이 큰 문자열일 때).
 */
export async function reviewWithAnthropic(
  apiKey: string,
  options: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
  },
): Promise<{ text: string; usage: Usage }> {
  const resp = await callAnthropicMessages(apiKey, {
    model: options.model,
    max_tokens: options.maxTokens ?? 8192,
    system: [{ type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: options.userPrompt }],
  });

  const textBlock = resp.content.find(c => c.type === 'text');
  if (!textBlock) {
    throw new Error('Anthropic 응답에 text content가 없습니다');
  }
  return { text: textBlock.text, usage: resp.usage };
}
