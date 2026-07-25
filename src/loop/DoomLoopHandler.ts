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
    suggestions.push(`Try a different approach instead of "${toolName}"`);
    suggestions.push('Read the relevant files first to understand the context');

    if (error.includes('not found') || error.includes('No such')) {
      suggestions.push('Check if the file path is correct');
      suggestions.push('Use glob or list_dir to discover the correct path');
    }
    if (error.includes('parse') || error.includes('syntax')) {
      suggestions.push('Verify the format of your input');
      suggestions.push('Use a simpler search pattern');
    }

    suggestions.push('Switch to Plan mode to design a different approach');
    suggestions.push('Consider using a different model provider');

    return suggestions;
  }

  formatAlertMessage(alert: DoomLoopAlert): string {
    const lines: string[] = [];
    lines.push('<system_note type="doom_loop_detected">');
    lines.push(`Tool "${alert.toolName}" failed ${alert.attemptCount} consecutive times with the same error.`);
    lines.push(`Last error: ${alert.lastError}`);
    lines.push('');
    lines.push('Suggestions:');
    for (const suggestion of alert.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('</system_note>');
    lines.push('');
    lines.push('Please ask the user how they would like to proceed.');

    return lines.join('\n');
  }

  getRecentAlerts(count = 5): DoomLoopAlert[] {
    return this.alertHistory.slice(-count);
  }

  clear(): void {
    this.alertHistory = [];
  }
}
