/**
 * STREAM-004 — outbound prior serialization for follow-up sends.
 *
 * sealBodyBeforeTools 계약(안정 표면)은 그대로 둔다: 스트리밍 중 assistant 본문은
 * content → turnProse로 봉인될 수 있어 완료 후 메시지가 content:'' + turnProse
 * (그리고 openingLead)만 남는다. 이 모듈은 **모델에 보내는 prior 직렬화에서만**
 * 봉인된 prose를 content로 복원한다 — UI 표시·seal 계약은 변경하지 않는다.
 *
 * 첨부 이미지는 여기서 다루지 않는다: AgentMessage에는 image 필드가 없고,
 * 이미지는 useChatStream의 CHAT-012 경로(마지막 user 턴 attachments)에서 별도 처리된다.
 */
import type { AgentMessage } from '../../loop/agentMessage';
import type { ChatMessage } from '../types';

/**
 * assistant outbound content — content가 비어 있으면 봉인된 산문
 * (openingLead + turnProse join)으로 복원. content가 있으면 그대로 (중복 방지).
 */
export function assistantOutboundContent(m: ChatMessage): string {
  if (m.content && m.content.trim()) return m.content;
  return [m.openingLead, ...(m.turnProse || []).map((p) => p.content)]
    .filter((s) => s?.trim())
    .join('\n\n');
}

/**
 * prior ChatMessage[] → AgentMessage[] (follow-up send / resynthesize 공용).
 *  - streaming assistant 제외 (아직 답이 스트리밍 중인 턴)
 *  - assistant: content || (openingLead + turnProse join)
 *  - user/system: content 그대로
 */
export function serializePriorMessages(raw: ChatMessage[]): AgentMessage[] {
  return raw
    .filter((m) => !(m.role === 'assistant' && m.status === 'streaming'))
    .map((m) => ({
      role: m.role as AgentMessage['role'],
      content: m.role === 'assistant' ? assistantOutboundContent(m) : m.content,
      name: undefined
    }));
}
