/**
 * DebugTools - Debug 모드 도구 설정 (C6-T23)
 * 
 * Debug 모드는 edit_file 허용 (계측용), Plan 모드와 whitelist 분리
 */
import { modeRegistry } from '../agent/modeRegistry';

export class DebugTools {
  /**
   * Get tools allowed in Debug mode
   */
  getAllowedTools(): string[] {
    return modeRegistry.getModeConfig('debug').allowedTools;
  }

  /**
   * Check if a tool is allowed
   */
  isToolAllowed(toolName: string): boolean {
    return modeRegistry.isToolAllowed('debug', toolName);
  }
}
