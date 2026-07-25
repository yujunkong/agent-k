/**
 * DoomLoopHandler - Doom Loop 감지 시 중단 + UI 알림 + 모델 변경 제안 (C3-T05)
 */
import type { DoomLoopDetector } from '../loop/DoomLoopDetector';

export interface DoomLoopAlert {
  type: 'doom_loop';
  toolName: string;
  attemptCount: number;
  lastError: string;
  suggestions: string[];
  timestamp: number;
}

export class DoomLoopHandler {
  private alertHistory: DoomLoopAlert[] = [];

  handleDoomLoop(detector: DoomLoopDetector): DoomLoopAlert | null {
    const loopInfo = detector.getLoopInfo();
    if (!loopInfo) return null;

    const alert: DoomLoopAlert = {
      type: 'doom_loop',
      toolName: loopInfo.toolName,
      attemptCount: loopInfo.count,
      lastError: loopInfo.lastError,
      suggestions: this.generateSuggestions(loopInfo.toolName, loopInfo.lastError),
      timestamp: Date.now()
    };

    this.alertHistory.push(alert);
    detector.reset();

    return alert;
  }

  private generateSuggestions(toolName: string, error: string): string[] {
    const suggestions: string[] = [];
    if (error === 'ok') {
      suggestions.push(`Do not call "${toolName}" again with the same path — summarize what you already have`);
      suggestions.push('Use grep/glob to find other files, or answer from context already read');
    } else {
      suggestions.push(`Try a different approach instead of "${toolName}"`);
    }

    if (error.includes('escapes') || error.includes('workspace')) {
      suggestions.push('Open the correct workspace folder, or use paths inside the current workspace');
      suggestions.push('Use glob / list_dir from the workspace root first');
    }
    if (error.includes('not found') || error.includes('No such')) {
      suggestions.push('Check if the file path is correct');
      suggestions.push('Use glob or list_dir to discover the correct path');
    }
    if (error.includes('parse') || error.includes('syntax')) {
      suggestions.push('Verify the format of your input');
      suggestions.push('Use a simpler search pattern');
    }

    suggestions.push('Switch to Plan mode to design a different approach');
    return suggestions;
  }

  formatAlertMessage(alert: DoomLoopAlert): string {
    const lines: string[] = [];
    const sameOk = alert.lastError === 'ok';
    lines.push(
      sameOk
        ? `Stopped: \`${alert.toolName}\` was called ${alert.attemptCount} times with the same arguments (no progress).`
        : `Stopped: \`${alert.toolName}\` failed ${alert.attemptCount} times with the same error.`
    );
    if (!sameOk) {
      lines.push(`Last error: ${alert.lastError}`);
    }
    lines.push('');
    lines.push('Next steps:');
    for (const suggestion of alert.suggestions.slice(0, 3)) {
      lines.push(`- ${suggestion}`);
    }
    return lines.join('\n');
  }

  getRecentAlerts(count = 5): DoomLoopAlert[] {
    return this.alertHistory.slice(-count);
  }

  clear(): void {
    this.alertHistory = [];
  }
}
