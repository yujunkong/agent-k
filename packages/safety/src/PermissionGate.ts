/**
 * SAFE-001 — PermissionGate.
 * Tool execution permission policy: ask / accept_edits / auto / bypass.
 * Session allow + listener approval; deny globs always reject.
 */

import { isPathDenied, DEFAULT_DENY_GLOBS } from './denyGlobs';
import {
  type PermissionLevel,
  DEFAULT_PERMISSION_LEVEL,
  createSafetyError,
  type SafetyResult,
} from './types';

export interface PermissionRequest {
  toolName: string;
  args?: Record<string, unknown>;
  description?: string;
  /** When true, `auto` still asks the user. */
  destructive?: boolean;
  path?: string;
}

export type PermissionDecision = 'allow_once' | 'allow_session' | 'reject';

export type PermissionListener = (
  request: PermissionRequest,
) => Promise<PermissionDecision> | PermissionDecision;

/** Tools that still need approval under accept_edits (CFG-003 defaults). */
export const DEFAULT_REQUIRE_APPROVAL_TOOLS: readonly string[] = [
  'run_terminal_cmd',
  'delete_file',
  'checkpoint_restore',
] as const;

export class PermissionGate {
  private level: PermissionLevel;
  private readonly allowedSessions = new Set<string>();
  private readonly listeners = new Set<PermissionListener>();
  private denyGlobs: readonly string[] = [...DEFAULT_DENY_GLOBS];
  private requireApprovalTools: readonly string[] = [
    ...DEFAULT_REQUIRE_APPROVAL_TOOLS,
  ];

  constructor(level: PermissionLevel = DEFAULT_PERMISSION_LEVEL) {
    this.level = level;
  }

  setLevel(level: PermissionLevel): void {
    this.level = level;
    // Changing away from accept_edits clears session cache (v2.1 parity).
    if (level !== 'accept_edits') {
      this.allowedSessions.clear();
    }
  }

  getLevel(): PermissionLevel {
    return this.level;
  }

  setDenyGlobs(globs: readonly string[]): void {
    this.denyGlobs = [...globs];
  }

  getDenyGlobs(): readonly string[] {
    return this.denyGlobs;
  }

  setRequireApprovalTools(tools: readonly string[]): void {
    this.requireApprovalTools = [...tools];
  }

  /**
   * Resolve permission for a tool call.
   * denyGlobs → reject; bypass → allow; otherwise level + session + listener.
   */
  async requestPermission(request: PermissionRequest): Promise<PermissionDecision> {
    if (this.level === 'bypass') {
      return 'allow_once';
    }

    if (request.path && isPathDenied(request.path, this.denyGlobs)) {
      return 'reject';
    }

    if (this.level === 'auto') {
      if (request.destructive) {
        return this.askUser(request);
      }
      return 'allow_once';
    }

    if (this.level === 'accept_edits') {
      if (this.requireApprovalTools.includes(request.toolName)) {
        const sessionKey = this.sessionKey(request.toolName, request.path);
        if (this.allowedSessions.has(sessionKey)) {
          return 'allow_once';
        }
        return this.askUser(request);
      }
      return 'allow_once';
    }

    // ask — always prompt
    return this.askUser(request);
  }

  /**
   * R-005-style wrapper around requestPermission.
   */
  async requestPermissionResult(
    request: PermissionRequest,
  ): Promise<SafetyResult<PermissionDecision>> {
    const decision = await this.requestPermission(request);
    if (decision === 'reject') {
      return {
        ok: false,
        error: createSafetyError(
          request.path && isPathDenied(request.path, this.denyGlobs)
            ? 'PATH_DENIED'
            : 'PERMISSION_DENIED',
          `Permission rejected for tool "${request.toolName}"`,
          {
            toolName: request.toolName,
            path: request.path ?? null,
            level: this.level,
          },
        ),
      };
    }
    return { ok: true, value: decision };
  }

  /** Remember allow-for-session for tool (+ optional path). */
  allowSession(toolName: string, path?: string): void {
    this.allowedSessions.add(this.sessionKey(toolName, path));
  }

  clearSessionApprovals(): void {
    this.allowedSessions.clear();
  }

  /** Subscribe to approval prompts; returns unsubscribe. */
  subscribe(listener: PermissionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private sessionKey(toolName: string, path?: string): string {
    return `${toolName}:${path ?? ''}`;
  }

  private async askUser(request: PermissionRequest): Promise<PermissionDecision> {
    for (const listener of this.listeners) {
      const decision = await listener(request);
      if (decision === 'allow_session') {
        this.allowSession(request.toolName, request.path);
      }
      return decision;
    }
    // No UI listener → fail closed
    return 'reject';
  }
}
