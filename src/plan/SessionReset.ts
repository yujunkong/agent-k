/**
 * SessionReset - Plan 모드 진입/이탈 시 세션 리셋 (C5-T20)
 */
import { modeRegistry } from '../agent/modeRegistry';
import type { Mode } from '../agent/types';

export class SessionReset {
  /**
   * Build the Plan mode entry system prompt
   */
  getPlanEntryPrompt(): string {
    return modeRegistry.getSystemPrompt('plan');
  }

  /**
   * Build the exit prompt when transitioning from Plan to another mode
   */
  getPlanExitPrompt(nextMode: Mode): string {
    return [
      `You are now in ${nextMode.toUpperCase()} mode.`,
      '',
      'Your Plan mode session has ended. The plan document is saved.',
      'Switch context to the current mode and follow instructions.'
    ].join('\n');
  }

  /**
   * Tools that should be available in Plan mode (whitelist)
   */
  getPlanWhitelist(): string[] {
    return modeRegistry.getModeConfig('plan').allowedTools;
  }
}
