/**
 * Base URL → Provider Type 자동 감지.
 *
 * Zero Configuration: 기본은 자동. OpenRouter/Together/Azure 등 애매한
 * 호스트는 OpenAI Compatible(litellm)로 폴백하고 ambiguous=true 로 표시해
 * 고급 설정에서 수동 오버라이드할 수 있게 한다.
 */
import type { ProviderType } from './types';

export type DetectConfidence = 'high' | 'low';

export interface ProviderTypeDetection {
  type: ProviderType;
  confidence: DetectConfidence;
  /** Gateway / Azure / 커스텀 프록시처럼 URL만으로 단정하기 어려운 경우 */
  ambiguous: boolean;
  reason: string;
}

function parseBaseUrl(raw: string): URL | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }
}

/** localhost / loopback / RFC1918 / .local 은 Local 배지·우선순위에 사용 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  const url = parseBaseUrl(baseUrl);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

const AMBIGUOUS_GATEWAYS: Array<{ match: (host: string) => boolean; label: string }> = [
  { match: (h) => h.includes('openrouter.ai'), label: 'OpenRouter' },
  { match: (h) => h.includes('together.xyz') || h.includes('together.ai'), label: 'Together' },
  { match: (h) => h.includes('fireworks.ai'), label: 'Fireworks' },
  { match: (h) => h.includes('groq.com'), label: 'Groq' },
  { match: (h) => h.includes('openai.azure.com') || (h.includes('azure.') && h.includes('openai')), label: 'Azure OpenAI' }
];

export function detectProviderType(baseUrl: string): ProviderTypeDetection {
  const url = parseBaseUrl(baseUrl);
  if (!url) {
    return {
      type: 'litellm',
      confidence: 'low',
      ambiguous: true,
      reason: 'Empty or invalid URL — defaulting to OpenAI Compatible'
    };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const port = url.port;

  if (host.includes('openai.azure.com') || (host.includes('azure.') && host.includes('openai'))) {
    return {
      type: 'litellm',
      confidence: 'low',
      ambiguous: true,
      reason: 'Azure OpenAI — OpenAI Compatible fallback (override in Advanced if needed)'
    };
  }

  if (host === 'api.openai.com' || host === 'openai.com' || (host.endsWith('.openai.com') && !host.includes('azure'))) {
    return { type: 'openai', confidence: 'high', ambiguous: false, reason: 'Official OpenAI API host' };
  }

  if (host.includes('anthropic.com')) {
    return { type: 'anthropic', confidence: 'high', ambiguous: false, reason: 'Anthropic API host' };
  }

  if (host.includes('opencode.ai')) {
    if (path.includes('/zen/go') || /\/go\/?$/.test(path)) {
      return { type: 'opencode-go', confidence: 'high', ambiguous: false, reason: 'OpenCode Go endpoint' };
    }
    return { type: 'opencode-zen', confidence: 'high', ambiguous: false, reason: 'OpenCode Zen endpoint' };
  }

  for (const gw of AMBIGUOUS_GATEWAYS) {
    if (gw.match(host)) {
      return {
        type: 'litellm',
        confidence: 'low',
        ambiguous: true,
        reason: `${gw.label} — OpenAI Compatible fallback (override in Advanced if needed)`
      };
    }
  }

  if (port === '11434' || host.includes('ollama')) {
    return { type: 'ollama', confidence: 'high', ambiguous: false, reason: 'Ollama host/port' };
  }

  if (port === '1234' || host.includes('lmstudio') || host.includes('lm-studio')) {
    return { type: 'lmstudio', confidence: 'high', ambiguous: false, reason: 'LM Studio host/port' };
  }

  const local = isLocalBaseUrl(baseUrl);
  return {
    type: 'litellm',
    confidence: local ? 'high' : 'low',
    ambiguous: !local,
    reason: local
      ? 'Local OpenAI-compatible endpoint'
      : 'Unknown host — OpenAI Compatible fallback'
  };
}
