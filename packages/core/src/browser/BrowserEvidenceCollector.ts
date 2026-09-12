/**
 * BrowserEvidenceCollector — BROWSER-003: Debug 증거용 스크린샷/콘솔/네트워크
 * (v2.1 C6-T29 동작 동등 이식; BrowserSessionManager 위임)
 */
import type { BrowserSessionManager } from './BrowserSession';

export interface BrowserEvidence {
  type: 'screenshot' | 'console' | 'network';
  timestamp: number;
  data: string;
  label: string;
}

export class BrowserEvidenceCollector {
  private evidence: BrowserEvidence[] = [];
  private sessionManager: BrowserSessionManager | null = null;

  /**
   * @param sessionManager — BrowserSessionManager 인스턴스 (옵션, 없으면 에러)
   */
  constructor(sessionManager?: BrowserSessionManager) {
    this.sessionManager = sessionManager ?? null;
  }

  /**
   * Attach a BrowserSessionManager after construction
   */
  attachSessionManager(sessionManager: BrowserSessionManager): void {
    this.sessionManager = sessionManager;
  }

  /**
   * Capture a screenshot via Playwright (RW-C6-03: stub → 실 캡처)
   * Returns base64 PNG data.
   */
  async captureScreenshot(label: string, sessionId?: string): Promise<BrowserEvidence> {
    let data = '';

    if (this.sessionManager) {
      try {
        // Use existing session or create a fresh one
        let page: any;
        if (sessionId) {
          const session = this.sessionManager.getSession(sessionId);
          if (session) {
            page = session.page;
          }
        }
        if (!page) {
          const fresh = await this.sessionManager.createSession();
          page = fresh.page;
          sessionId = fresh.id;
        }
        const buffer: Buffer = await page.screenshot({ type: 'png' });
        data = buffer.toString('base64');
      } catch (err) {
        data = `[Screenshot error: ${err instanceof Error ? err.message : String(err)}]`;
      }
    } else {
      data = '[BrowserSessionManager not available. Use attachSessionManager() or pass sessionManager to constructor.]';
    }

    const evidence: BrowserEvidence = { type: 'screenshot', timestamp: Date.now(), data, label };
    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Capture console logs from BrowserTools (RW-C6-03: stub 제거)
   */
  async captureConsole(label: string, sessionId?: string): Promise<BrowserEvidence> {
    let data = '';

    if (this.sessionManager && sessionId) {
      try {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          const logs = session.tools.getConsoleLogs();
          data = logs.map((l) => `[${l.type}] ${l.text}`).join('\n');
          session.tools.clearLogs();
        } else {
          data = `[Session "${sessionId}" not found]`;
        }
      } catch (err) {
        data = `[Console capture error: ${err instanceof Error ? err.message : String(err)}]`;
      }
    } else if (this.sessionManager && !sessionId) {
      data = '[Provide a sessionId to capture console logs]';
    } else {
      data = '[BrowserSessionManager not available]';
    }

    const evidence: BrowserEvidence = { type: 'console', timestamp: Date.now(), data: data || '(no console logs)', label };
    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Capture network requests from BrowserTools (RW-C6-03: stub 제거)
   */
  async captureNetwork(label: string, sessionId?: string): Promise<BrowserEvidence> {
    let data = '';

    if (this.sessionManager && sessionId) {
      try {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          const logs = session.tools.getNetworkLogs();
          data = logs.map((l) => `${l.method} ${l.status} ${l.url} (${l.timing}ms)`).join('\n');
          session.tools.clearLogs();
        } else {
          data = `[Session "${sessionId}" not found]`;
        }
      } catch (err) {
        data = `[Network capture error: ${err instanceof Error ? err.message : String(err)}]`;
      }
    } else if (this.sessionManager && !sessionId) {
      data = '[Provide a sessionId to capture network logs]';
    } else {
      data = '[BrowserSessionManager not available]';
    }

    const evidence: BrowserEvidence = { type: 'network', timestamp: Date.now(), data: data || '(no network requests)', label };
    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Get all collected evidence
   */
  getAllEvidence(): BrowserEvidence[] {
    return [...this.evidence];
  }

  /**
   * Attach evidence to timeline/analysis (debug 타임라인용)
   */
  formatEvidenceBlock(): string {
    if (this.evidence.length === 0) return '';

    const lines: string[] = ['## Browser Evidence', ''];
    for (const e of this.evidence) {
      const time = new Date(e.timestamp).toISOString().slice(11, 23);
      lines.push(`### [${time}] ${e.type}: ${e.label}`);
      lines.push('');
      if (e.type === 'screenshot') {
        // Embed as base64 data URI for inline display
        lines.push(`![screenshot](data:image/png;base64,${e.data.slice(0, 80)}... [${e.data.length} bytes])`);
      } else {
        lines.push('```');
        const snippet = e.data.length > 500 ? e.data.slice(0, 500) + '\n... (truncated)' : e.data;
        lines.push(snippet);
        lines.push('```');
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  clear(): void {
    this.evidence = [];
  }
}
