/**
 * V31-RETRY-04 / V31-QG2 — permission-denial tool-result shaping, extracted
 * from AgentLoopController.executeToolCalls.
 */

import { PermissionDenialRecovery } from '../retry';

export interface DenialToolResult {
  content: string;
  metadataType: 'permission_denied' | 'tool_result';
  /** True when the loop should continue (recovery budget available). */
  recover: boolean;
}

export function shapePermissionDenial(
  recovery: PermissionDenialRecovery,
  toolName: string,
  turn: number
): DenialToolResult {
  const r = recovery.onDenied({ toolName, turn });
  return {
    content: r.recover
      ? r.nudge
      : `Permission denied for tool "${toolName}". ${r.nudge}`,
    metadataType: 'permission_denied',
    recover: r.recover,
  };
}
