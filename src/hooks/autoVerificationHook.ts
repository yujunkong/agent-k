/**
 * autoVerificationHook - PostToolUse 자동 검증 훅 (C2-T18 / C4-T17 / ADDON-T01)
 *
 * edit/write 성공 후:
 * 1) lint (기본 on)
 * 2) 관련 테스트 (testEnabled / Tier B / agent-k.verification.testEnabled)
 * 실패 시 tool_result에 주입 → 모델 재시도
 */
import type { PostToolUseContext, PostToolUseResult } from './HookSystem';
import { LintRunner } from '../verification/LintRunner';
import { TestFinder } from '../verification/TestFinder';
import { TestRunner } from '../verification/TestRunner';
import {
  injectVerificationError,
  injectTestVerificationError,
} from './injectVerificationError';
import { askOnMaxRetries } from './askOnMaxRetries';
import {
  getVerificationConfig,
  type VerificationTier,
} from '../verification/config';

export interface AutoVerificationHookOptions {
  maxRetries?: number;
  lintEnabled?: boolean;
  testEnabled?: boolean;
  tier?: VerificationTier;
  lintRunner?: LintRunner;
  testFinder?: TestFinder;
  testRunner?: TestRunner;
}

export function createAutoVerificationHook(options?: AutoVerificationHookOptions) {
  const tierCfg = getVerificationConfig(options?.tier ?? 'A');
  const config = {
    maxRetries: options?.maxRetries ?? tierCfg.maxRetries,
    lintEnabled: options?.lintEnabled ?? tierCfg.lintEnabled,
    testEnabled: options?.testEnabled ?? tierCfg.testEnabled,
  };
  const lintRunner = options?.lintRunner ?? new LintRunner();
  const testFinder = options?.testFinder ?? new TestFinder();
  const testRunner = options?.testRunner ?? new TestRunner();
  const retryCounts = new Map<string, number>();

  return async (context: PostToolUseContext): Promise<PostToolUseResult> => {
    if (context.toolName !== 'edit_file' && context.toolName !== 'write_file') {
      return { action: 'allow' };
    }

    const filePath = context.args?.path as string | undefined;
    if (!filePath || !context.result.success) {
      return { action: 'allow' };
    }

    const key = `${context.toolName}:${filePath}`;

    // ── Lint ──────────────────────────────────────────────
    if (config.lintEnabled) {
      const errors = await lintRunner.runLint([filePath]);
      if (errors.length > 0) {
        const retryCount = retryCounts.get(key) || 0;
        retryCounts.set(key, retryCount + 1);

        if (retryCount >= config.maxRetries) {
          const msg = askOnMaxRetries(
            context.toolName,
            filePath,
            errors[0].message,
            retryCount
          );
          return {
            action: 'modify',
            modifiedResult: {
              success: false,
              error: errors.map((e) => e.message).join('; '),
              data: {
                verificationInjected: true,
                kind: 'lint',
                lintErrors: errors,
                userGuidance: msg,
              },
              metadata: { duration: context.duration, truncated: false },
            },
            reason: `Lint errors after ${retryCount + 1} attempts`,
          };
        }

        const injected = injectVerificationError(
          errors,
          retryCount,
          config.maxRetries
        );
        return {
          action: 'modify',
          modifiedResult: {
            success: false,
            error: errors.map((e) => e.message).join('; '),
            data: {
              verificationInjected: true,
              kind: 'lint',
              lintErrors: errors,
              retryMessage: injected.content,
            },
            metadata: { duration: context.duration, truncated: false },
          },
          reason: `Lint: ${errors.length} error(s)`,
        };
      }
    }

    // ── Related tests (ADDON-T01) ─────────────────────────
    if (config.testEnabled) {
      const related = testFinder.findRelatedTests(filePath);
      if (related.length > 0) {
        const testPaths = related.map((t) => t.filePath);
        const testResult = await testRunner.runRelatedTestFiles(testPaths);
        if (!testResult.success) {
          const retryCount = retryCounts.get(key) || 0;
          retryCounts.set(key, retryCount + 1);
          const summary =
            testResult.error ||
            `Tests failed: ${testResult.failed} failed, ${testResult.passed} passed`;

          if (retryCount >= config.maxRetries) {
            const msg = askOnMaxRetries(
              context.toolName,
              filePath,
              summary,
              retryCount
            );
            return {
              action: 'modify',
              modifiedResult: {
                success: false,
                error: summary,
                data: {
                  verificationInjected: true,
                  kind: 'test',
                  testResult,
                  testFiles: testPaths,
                  userGuidance: msg,
                },
                metadata: { duration: context.duration, truncated: false },
              },
              reason: `Tests failed after ${retryCount + 1} attempts`,
            };
          }

          const injected = injectTestVerificationError(
            testResult.output || summary,
            testPaths,
            retryCount,
            config.maxRetries
          );
          return {
            action: 'modify',
            modifiedResult: {
              success: false,
              error: summary,
              data: {
                verificationInjected: true,
                kind: 'test',
                testResult,
                testFiles: testPaths,
                retryMessage: injected.content,
              },
              metadata: { duration: context.duration, truncated: false },
            },
            reason: `Test: ${testResult.failed} failed`,
          };
        }
      }
    }

    return { action: 'allow' };
  };
}
