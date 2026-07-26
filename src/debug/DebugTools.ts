/**
 * DebugTools - Debug 모드 도구 설정 (C6-T23)
 *
 * Stage별 허용 도구는 DEBUG_STAGE_TOOLS / isDebugToolAllowedForStage 참고.
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
