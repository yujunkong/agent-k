/**
 * HookSystem - PreToolUse / PostToolUse (C4-T15)
 * 
 * 차단/수정/로깅/시크릿 스캔
 */
import type { ToolInput, ToolOutput } from '../tools/types';

export type HookAction = 'allow' | 'block' | 'modify';

export interface PreToolUseContext {
  toolName: string;
  args: ToolInput;
  mode: string;
  turnNumber: number;
}

export interface PostToolUseContext {
  toolName: string;
  args: ToolInput;
  result: ToolOutput;
  mode: string;
  turnNumber: number;
  duration: number;
}

export interface PreToolUseResult {
  action: HookAction;
  modifiedArgs?: ToolInput;
  reason?: string;
}

export interface PostToolUseResult {
  action: HookAction;
  modifiedResult?: ToolOutput;
  reason?: string;
}

export type PreToolUseHook = (context: PreToolUseContext) => Promise<PreToolUseResult>;
export type PostToolUseHook = (context: PostToolUseContext) => Promise<PostToolUseResult>;

export class HookSystem {
  private preHooks: PreToolUseHook[] = [];
  private postHooks: PostToolUseHook[] = [];
  private logs: Array<{ type: string; toolName: string; action: string; reason?: string }> = [];

  registerPreHook(hook: PreToolUseHook): () => void {
    this.preHooks.push(hook);
    const idx = this.preHooks.length - 1;
    return () => {
      this.preHooks.splice(idx, 1);
    };
  }

  registerPostHook(hook: PostToolUseHook): () => void {
    this.postHooks.push(hook);
    const idx = this.postHooks.length - 1;
    return () => {
      this.postHooks.splice(idx, 1);
    };
  }

  async runPreHooks(context: PreToolUseContext): Promise<PreToolUseResult> {
    for (const hook of this.preHooks) {
      const result = await hook(context);
      this.logs.push({
        type: 'pre',
        toolName: context.toolName,
        action: result.action,
        reason: result.reason
      });

      if (result.action === 'block') {
        return result;
      }
      if (result.action === 'modify' && result.modifiedArgs) {
        context = { ...context, args: result.modifiedArgs };
      }
    }

    return { action: 'allow' };
  }

  async runPostHooks(context: PostToolUseContext): Promise<PostToolUseResult> {
    let currentResult = { ...context.result };

    for (const hook of this.postHooks) {
      const result = await hook({ ...context, result: currentResult });
      this.logs.push({
        type: 'post',
        toolName: context.toolName,
        action: result.action,
        reason: result.reason
      });

      if (result.action === 'block') {
        return result;
      }
      if (result.action === 'modify' && result.modifiedResult) {
        currentResult = result.modifiedResult;
      }
    }

    return { action: 'allow', modifiedResult: currentResult };
  }

  clearLogs(): void {
    this.logs = [];
  }

  getLogs(): Array<{ type: string; toolName: string; action: string; reason?: string }> {
    return [...this.logs];
  }

  clear(): void {
    this.preHooks = [];
    this.postHooks = [];
    this.logs = [];
  }
}

// ─── Built-in hooks ────────────────────────────────────

/**
 * Secret scan hook: API 키, 패스워드 패턴 감지 → 차단/마스킹 (C4-T16)
 */
export function createSecretScanHook(): PreToolUseHook {
  const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9]{20,}/,        // OpenAI key
    /ghp_[a-zA-Z0-9]{36,}/,       // GitHub PAT
    /gho_[a-zA-Z0-9]{36,}/,       // GitHub OAuth
    /api[-_]?key['":\s]{1,}['"][a-zA-Z0-9]{16,}['"]/i,
    /password['":\s]{1,}['"][^'"]{4,}['"]/i,
    /secret['":\s]{1,}['"][^'"]{8,}['"]/i,
    /token['":\s]{1,}['"][a-zA-Z0-9]{8,}['"]/i,
  ];

  return async (context: PreToolUseContext): Promise<PreToolUseResult> => {
    // Check arguments for secrets
    const argsStr = JSON.stringify(context.args);

    for (const pattern of SECRET_PATTERNS) {
      const match = argsStr.match(pattern);
      if (match) {
        return {
          action: 'modify',
          modifiedArgs: maskSecrets(context.args, pattern),
          reason: `Secret detected: ${match[0].slice(0, 12)}...`
        };
      }
    }

    return { action: 'allow' };
  };
}

function maskSecrets(args: ToolInput, pattern: RegExp): ToolInput {
  const masked: ToolInput = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      masked[key] = value.replace(pattern, '***MASKED***');
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSecrets(value, pattern);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
