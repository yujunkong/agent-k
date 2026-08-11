/**
 * DebugTools - Debug 모드 도구 설정 (C6-T23)
 *
 * Pre-fix product edits are hard-gated via debugWriteGate / isDebugToolAllowedForStage.
 */
import { modeRegistry } from '../agent/modeRegistry';
import {
  isDebugToolAllowedForStage,
  type DebugStage
} from '../debug/DebugModeController';

export class DebugTools {
  getAllowedTools(): string[] {
    return modeRegistry.getModeConfig('debug').allowedTools;
  }

  isToolAllowed(toolName: string): boolean {
    return modeRegistry.isToolAllowed('debug', toolName);
  }

  isToolAllowedInStage(stage: DebugStage, toolName: string): boolean {
    return (
      this.isToolAllowed(toolName) && isDebugToolAllowedForStage(stage, toolName)
    );
  }
}
