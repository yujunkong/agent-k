/**
 * SUB-010 — subagent detail tab descriptor (child ChatSession id).
 * Transcript UI is the main ChatApp message-list (composer hidden); no separate view.
 */

export type SubagentDetailTab = {
  /** Child ChatSession id (sess-sub-*) */
  id: string;
  title: string;
  parentSessionId: string;
  /** Runner task id when known */
  taskId?: string;
};
