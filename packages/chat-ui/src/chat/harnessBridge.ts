/**
 * Chat ↔ Harness bridge (HARB)
 * ContextAssembler + PrefetchEngine을 채팅 전송 경로에 연결
 */
import type { Mode } from '../agent/types';
import { ContextAssembler } from '../agent/ContextAssembler';
import { PrefetchEngine } from '../prefetch/PrefetchEngine';
import type { ContextAssembly } from '../agent/ContextAssembler';
import { toolRegistry } from '../tools/registry';
import type { ModelTier } from '../harness/ModelTiers';

export interface HarnessTurnContext {
  /** 조립된 시스템 프롬프트 (하네스 블록 포함) */
  systemPrompt: string;
  /** `<prefetch>...</prefetch>` 래핑 블록 (비어 있으면 '') */
  prefetchBlock: string;
  /** PrefetchEngine 원문 */
  prefetchRaw: string;
  assembly: ContextAssembly;
}

/**
 * 사용자 턴 텍스트에 대해 프리페치 + 컨텍스트 조립 수행
 * @param userText Composer 입력
 * @param mode 현재 채팅 모드
 * @param tier 모델 티어 (기본 A)
 */
export async function buildHarnessTurnContext(
  userText: string,
  mode: Mode,
  tier: ModelTier = 'A'
): Promise<HarnessTurnContext> {
  const prefetchEngine = new PrefetchEngine();
  const prefetchRaw = await prefetchEngine.prefetch(userText, mode);
  const prefetchBlock = prefetchRaw
    ? `<prefetch>\n${prefetchRaw}\n</prefetch>`
    : '';

  const assembler = new ContextAssembler();
  const toolSchemas = toolRegistry.getSchemas(mode, tier);
  const assembly = assembler.assemble(
    mode,
    [{ role: 'user', content: userText }],
    {
      tier,
      toolSchemas,
      stickyContext: prefetchBlock
    }
  );

  const systemPrompt =
    assembly.slots.find(s => s.name === 'system')?.content || '';

  return { systemPrompt, prefetchBlock, prefetchRaw, assembly };
}

/**
 * 전송 payload에 프리페치 주입 (API 전용 — UI 말풍선에는 넣지 말 것).
 * All modes are host-mediated: AgentLoop owns system+TurnStructure —
 * only inject prefetch here.
 */
export function prependHarnessToUserPayload(
  userText: string,
  ctx: Pick<HarnessTurnContext, 'prefetchBlock' | 'systemPrompt'>,
  mode?: Mode
): string {
  const parts: string[] = [];
  // Host path for every mode — keep user payload clean (prefetch only)
  void mode;
  if (ctx.prefetchBlock) {
    parts.push(ctx.prefetchBlock);
  }
  parts.push(userText);
  return parts.join('\n\n');
}

/** Comment: V31-UI-15 — re-export SoT from chatAppHelpers (legacy import path). */
export { stripHarnessForDisplay } from './chatAppHelpers';
