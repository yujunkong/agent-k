/**
 * SHARED-002 — file edit payload for chat.stream `file.edit` events.
 * Presentation (FileEditCard) stays in chat-ui; this is the wire contract only.
 */

export type FileEditLineType = 'add' | 'delete' | 'context';

export interface FileEditLine {
  type: FileEditLineType;
  lineNumber: number;
  text: string;
}

export interface FileEditPayload {
  path: string;
  absPath?: string;
  checkpointId?: string;
  turn?: number;
  /** Host tool call id — links FileEditCard to the Edited timeline row */
  toolId?: string;
  additions: number;
  deletions: number;
  lines: FileEditLine[];
}
