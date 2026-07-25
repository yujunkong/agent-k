/**
 * cancelInFlight - Resynthesize 시 in-flight 도구/셸 취소 (C3-T32)
 * 
 * HTTP 요청 Abort + 셸 프로세스 SIGTERM
 */
import type { AgentLoopController } from './AgentLoopController';

export interface CancelResult {
  cancelledAborts: number;
  cancelledShells: number;
  duration: number;
}

export async function cancelInFlight(controller?: AgentLoopController): Promise<CancelResult> {
  const start = Date.now();

  let cancelledAborts = 0;
  let cancelledShells = 0;

  // 1. Abort HTTP requests / streaming
  if (controller) {
    controller.stop();
    cancelledAborts = 1;
  }

  // 2. Kill any running terminal processes
  try {
    const { TerminalTool } = await import('../tools/terminal/TerminalTool');
    const terminalTool = new TerminalTool();
    terminalTool.kill();
    cancelledShells = 1;
  } catch {
    // TerminalTool not available
  }

  return {
    cancelledAborts,
    cancelledShells,
    duration: Date.now() - start
  };
}
