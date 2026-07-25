/**
 * DesignModeOverlay — 스크린샷 오버레이 + 요소 선택 → 주석/좌표 (C7-T03)
 */
import type { BrowserTools } from '../browser/BrowserTools';

export interface DesignAnnotation {
  selector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  timestamp: number;
}

export interface DesignSnapshot {
  screenshot: string; // base64 PNG
  viewport: { width: number; height: number };
  annotations: DesignAnnotation[];
  url: string;
  title: string;
  timestamp: number;
}

export class DesignModeOverlay {
  private annotations: DesignAnnotation[] = [];
  private lastSnapshot: DesignSnapshot | null = null;

  /**
   * Take screenshot of current page state
   */
  async captureSnapshot(tools: BrowserTools, url: string, title: string): Promise<DesignSnapshot> {
    const screenshot = await tools.screenshot({ fullPage: false });

    this.lastSnapshot = {
      screenshot,
      viewport: { width: 1280, height: 720 }, // default — would be from page
      annotations: [],
      url,
      title,
      timestamp: Date.now()
    };

    return this.lastSnapshot;
  }

  /**
   * Add annotation at coordinates
   */
  addAnnotation(params: {
    selector?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    comment: string;
  }): DesignAnnotation {
    const annotation: DesignAnnotation = {
      selector: params.selector ?? `[data-design-${this.annotations.length}]`,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      comment: params.comment,
      timestamp: Date.now()
    };

    this.annotations.push(annotation);
    return annotation;
  }

  /**
   * Get all annotations
   */
  getAnnotations(): DesignAnnotation[] {
    return [...this.annotations];
  }

  /**
   * Get last snapshot
   */
  getLastSnapshot(): DesignSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Clear annotations
   */
  clear(): void {
    this.annotations = [];
    this.lastSnapshot = null;
  }

  /**
   * Export annotations as context for next turn
   */
  exportAnnotationsAsContext(): string {
    if (this.annotations.length === 0) return '';

    return [
      '## Design Mode Annotations',
      '',
      ...this.annotations.map((a, i) => {
        return [
          `### Annotation ${i + 1}: ${a.comment}`,
          `- Selector: \`${a.selector}\``,
          `- Position: (${a.x}, ${a.y})`,
          `- Size: ${a.width}×${a.height}`,
          `- Comment: ${a.comment}`
        ].join('\n');
      })
    ].join('\n\n');
  }

  /**
   * Truncate context to avoid budget overflow
   */
  exportTruncatedContext(maxAnnotations: number = 5): string {
    const relevant = this.annotations.slice(-maxAnnotations);
    if (relevant.length === 0) return '';

    const header = `## Design Mode Annotations (last ${relevant.length})`;
    const lines = relevant.map(a => `- \`${a.selector}\`: ${a.comment}`);
    return [header, '', ...lines].join('\n');
  }
}
