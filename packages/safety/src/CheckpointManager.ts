/**
 * SAFE-006 — CheckpointManager (in-memory metadata + file snapshots).
 * create / list / restore — no disk I/O; callers supply snapshot contents.
 */

import type { AgentMode } from '@agent-k/shared';
import { createSafetyError, type SafetyResult } from './types';

export type CheckpointTrigger =
  | 'first_write'
  | 'n_files'
  | 'user_request'
  | 'dangerous_tool';

export interface FileSnapshot {
  filePath: string;
  /** Full file contents at checkpoint time (in-memory only). */
  content: string;
  /** Optional content hash for callers that compute one. */
  hash?: string;
}

export interface CheckpointMetadata {
  turnNumber?: number;
  /** Optional AgentMode from @agent-k/shared (no core import). */
  mode?: AgentMode | string;
  trigger: CheckpointTrigger;
  label?: string;
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  label: string;
  fileSnapshots: FileSnapshot[];
  metadata: CheckpointMetadata;
}

export interface RestoreResult {
  checkpointId: string;
  /** Snapshots to re-apply by the host / tools layer. */
  fileSnapshots: FileSnapshot[];
}

const DEFAULT_MAX_CHECKPOINTS = 50;

/**
 * In-memory checkpoint store. Restore returns snapshot map only —
 * does not write the filesystem (keeps package free of vscode/fs side effects).
 */
export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private readonly maxCheckpoints: number;

  constructor(maxCheckpoints = DEFAULT_MAX_CHECKPOINTS) {
    this.maxCheckpoints = maxCheckpoints;
  }

  /**
   * Create a checkpoint from caller-provided file contents.
   * `files` is a path → content map (or array of snapshots).
   */
  create(
    files: Record<string, string> | FileSnapshot[],
    metadata: CheckpointMetadata,
  ): Checkpoint {
    const fileSnapshots: FileSnapshot[] = Array.isArray(files)
      ? files.map((s) => ({ ...s }))
      : Object.entries(files).map(([filePath, content]) => ({ filePath, content }));

    const checkpoint: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      label: metadata.label ?? metadata.trigger,
      fileSnapshots,
      metadata: { ...metadata },
    };

    this.checkpoints.push(checkpoint);
    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints = this.checkpoints.slice(-this.maxCheckpoints);
    }
    return checkpoint;
  }

  list(): readonly Checkpoint[] {
    return [...this.checkpoints];
  }

  get(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.find((c) => c.id === checkpointId);
  }

  /**
   * Restore metadata only: returns the stored snapshots for the host to apply.
   */
  restore(checkpointId: string): SafetyResult<RestoreResult> {
    const checkpoint = this.get(checkpointId);
    if (!checkpoint) {
      return {
        ok: false,
        error: createSafetyError(
          'CHECKPOINT_NOT_FOUND',
          `Checkpoint not found: ${checkpointId}`,
          { checkpointId },
        ),
      };
    }
    return {
      ok: true,
      value: {
        checkpointId: checkpoint.id,
        fileSnapshots: checkpoint.fileSnapshots.map((s) => ({ ...s })),
      },
    };
  }

  clear(): void {
    this.checkpoints = [];
  }
}
