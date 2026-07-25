/**
 * PermissionGate - 4단계 권한 관리 (C4-T01)
 * 
 * ask → accept_edits → auto → bypass
 * denyGlobs 패턴 지원
 */
export type PermissionLevel = 'ask' | 'accept_edits' | 'auto' | 'bypass';

export interface PermissionRequest {
  toolName: string;
  args: Record<string, any>;
  description: string;
  destructive: boolean;
  path?: string;
}

export type PermissionDecision = 'allow_once' | 'allow_session' | 'reject';

export interface PermissionRule {
  pattern: string; // glob pattern for file paths
  allow: boolean;
}

export interface PermissionConfig {
  defaultLevel: PermissionLevel;
  denyGlobs: string[];
  requireApprovalTools: string[];
}

export type PermissionListener = (request: PermissionRequest) => Promise<PermissionDecision>;

export class PermissionGate {
  private level: PermissionLevel;
  private allowedSessions: Set<string> = new Set();
  private listeners: Set<PermissionListener> = new Set();
  private denyGlobs: string[] = [];
  private requireApprovalTools: string[] = [
    'edit_file', 'write_file', 'run_terminal_cmd',
    'delete_file', 'checkpoint_restore'
  ];

  constructor(level: PermissionLevel = 'ask') {
    this.level = level;
  }

  setLevel(level: PermissionLevel): void {
    this.level = level;
    if (level !== 'accept_edits') {
      this.allowedSessions.clear();
    }
  }

  getLevel(): PermissionLevel {
    return this.level;
  }

  setDenyGlobs(globs: string[]): void {
    this.denyGlobs = globs;
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionDecision> {
    // Bypass → always allow
    if (this.level === 'bypass') return 'allow_once';

    // Check denyGlobs
    if (request.path && this.isDenied(request.path)) {
      return 'reject';
    }

    // Auto → allow all non-destructive, ask for destructive
    if (this.level === 'auto') {
      if (request.destructive) {
        return await this.askUser(request);
      }
      return 'allow_once';
    }

    // Accept edits → allow edits if session-allowed
    if (this.level === 'accept_edits') {
      if (this.requireApprovalTools.includes(request.toolName)) {
        // Check if this tool was already session-approved
        const sessionKey = `${request.toolName}:${request.path || ''}`;
        if (this.allowedSessions.has(sessionKey)) {
          return 'allow_once';
        }
        return await this.askUser(request);
      }
      return 'allow_once';
    }

    // Ask → always ask
    return await this.askUser(request);
  }

  allowSession(toolName: string, path?: string): void {
    this.allowedSessions.add(`${toolName}:${path || ''}`);
  }

  clearSessionApprovals(): void {
    this.allowedSessions.clear();
  }

  subscribe(listener: PermissionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async askUser(request: PermissionRequest): Promise<PermissionDecision> {
    for (const listener of this.listeners) {
      const decision = await listener(request);
      if (decision === 'allow_session') {
        this.allowSession(request.toolName, request.path);
      }
      return decision;
    }
    // Fallback: reject if no listener
    return 'reject';
  }

  private isDenied(path: string): boolean {
    return this.denyGlobs.some(pattern => {
      const regex = this.globToRegex(pattern);
      return regex.test(path);
    });
  }

  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }
}
