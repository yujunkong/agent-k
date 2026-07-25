/**
 * DesignModeContext — 주석 좌표 + 스크린샷 → 다음 턴 컨텍스트 첨부 (C7-T04)
 */
import { DesignModeOverlay, type DesignSnapshot } from './DesignModeOverlay';

export interface DesignModeContextPayload {
  snapshot: DesignSnapshot;
  contextBlock: string;
  truncatedBlock: string;
  hasAnnotations: boolean;
}

const MAX_CONTEXT_LENGTH = 4000; // characters for the context block

export class DesignModeContext {
  private overlay: DesignModeOverlay;
  private lastContext: DesignModeContextPayload | null = null;

  constructor(overlay: DesignModeOverlay) {
    this.overlay = overlay;
  }

  /**
   * Build context payload from current design state
   */
  buildContext(): DesignModeContextPayload | null {
    const snapshot = this.overlay.getLastSnapshot();
    if (!snapshot) return null;

    const fullBlock = this.overlay.exportAnnotationsAsContext();
    const truncatedBlock = this.overlay.exportTruncatedContext(3);

    const contextBlock = this.truncateContext(fullBlock, MAX_CONTEXT_LENGTH);

    const payload: DesignModeContextPayload = {
      snapshot,
      contextBlock,
      truncatedBlock,
      hasAnnotations: this.overlay.getAnnotations().length > 0
    };

    this.lastContext = payload;
    return payload;
  }

  /**
   * Inject context into agent system prompt
   */
  injectContext(existingPrompt: string): { prompt: string; injected: boolean } {
    const ctx = this.buildContext();
    if (!ctx || !ctx.hasAnnotations) {
      return { prompt: existingPrompt, injected: false };
    }

    const injection = [
      '',
      '---',
      '### Design Mode Context',
      `URL: ${ctx.snapshot.url}`,
      `Title: ${ctx.snapshot.title}`,
      `Viewport: ${ctx.snapshot.viewport.width}×${ctx.snapshot.viewport.height}`,
      '',
      ctx.contextBlock,
      '---'
    ].join('\n');

    return {
      prompt: existingPrompt + '\n' + injection,
      injected: true
    };
  }

  /**
   * Get last built context
   */
  getLastContext(): DesignModeContextPayload | null {
    return this.lastContext;
  }

  /**
   * Clear
   */
  clear(): void {
    this.lastContext = null;
  }

  private truncateContext(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + `\n\n... (truncated, full length: ${text.length} chars)`;
  }
}
