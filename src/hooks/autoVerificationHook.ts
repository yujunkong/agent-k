/**
 * autoVerificationHook - PostToolUse 자동 검증 훅 (C2-T18 / C4-T17)
 */
import type { PostToolUseContext, PostToolUseResult } from './HookSystem';
import { LintRunner } from '../verification/LintRunner';
import { injectVerificationError } from './injectVerificationError';
import { askOnMaxRetries } from './askOnMaxRetries';

export function createAutoVerificationHook(options?: {
  maxRetries?: number;
  lintEnabled?: boolean;
  testEnabled?: boolean;
}) {
  const config = { maxRetries: 2, lintEnabled: true, testEnabled: false, ...options };
  const lintRunner = new LintRunner();
  const retryCounts = new Map<string, number>();

  return async (context: PostToolUseContext): Promise<PostToolUseResult> => {
    // Only verify after edit/write tools
    if (context.toolName !== 'edit_file' && context.toolName !== 'write_file') {
      return { action: 'allow' };
    }

    const filePath = context.args?.path;
    if (!filePath) return { action: 'allow' };

    // Run lint
    if (config.lintEnabled && context.result.success) {
      const errors = await lintRunner.runLint([filePath]);
      
      if (errors.length > 0) {
        const key = `${context.toolName}:${filePath}`;
        const retryCount = retryCounts.get(key) || 0;
        retryCounts.set(key, retryCount + 1);

        if (retryCount >= config.maxRetries) {
          const msg = askOnMaxRetries(context.toolName, filePath, errors[0].message, retryCount);
          return {
            action: 'modify',
            modifiedResult: {
              success: false,
              error: errors.map(e => e.message).join('; '),
              data: { lintErrors: errors, userGuidance: msg },
              metadata: { duration: context.duration, truncated: false }
            },
            reason: `Lint errors after ${retryCount + 1} attempts`
          };
        }

        const injected = injectVerificationError(errors, retryCount, config.maxRetries);
        return {
          action: 'modify',
          modifiedResult: {
            success: false,
            error: errors.map(e => e.message).join('; '),
            data: { lintErrors: errors, retryMessage: injected.content },
            metadata: { duration: context.duration, truncated: false }
          },
          reason: `Lint: ${errors.length} error(s)`
        };
      }
    }

    return { action: 'allow' };
  };
}
