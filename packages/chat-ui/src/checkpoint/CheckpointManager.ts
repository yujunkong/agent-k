/**
 * Checkpoint types — UI-only surface (SAFE-006 / CONV-016).
 * Runtime checkpoint manager lives in @agent-k/safety (host-owned); the
 * webview consumes checkpoint lists via `checkpoint.listResult` and posts
 * `checkpoint.restore` back to the host.
 */

export interface Checkpoint {
  id: string;
  timestamp: number;
  label: string;
  fileSnapshots: FileSnapshot[];
  metadata: {
    turnNumber: number;
    mode: string;
    trigger: 'first_write' | 'n_files' | 'user_request' | 'dangerous_tool';
  };
}

export interface FileSnapshot {
  filePath: string;
  content: string;
  hash: string;
}
