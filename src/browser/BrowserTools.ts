/**
 * BrowserTools — Playwright 브라우저 자동화 (C7-T01)
 *
 * Core API: navigate, click, scroll, wait, screenshot, evaluate, console, network
 * Tier A deny: 이 도구들은 Tier A(Flash)에서 노출 금지
 *
 * NOTE: Playwright is optional. Install with `npm install playwright` to enable.
 * Types used here are compatible with the @playwright/browser package.
 */

// Playwright types — use `any` to avoid hard dependency
type PlaywrightPage = any;

export type BrowserAction =
  | 'navigate'
  | 'click'
  | 'scroll'
  | 'wait'
  | 'screenshot'
  | 'evaluate'
  | 'console'
  | 'network';

export interface NavigateParams {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ClickParams {
  selector: string;
  options?: { timeout?: number; force?: boolean };
}

export interface ScrollParams {
  selector?: string;
  x?: number;
  y?: number;
}

export interface WaitParams {
  selector?: string;
  timeout?: number;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

export interface ScreenshotParams {
  selector?: string;
  fullPage?: boolean;
}

export interface EvaluateParams {
  script: string;
  args?: unknown[];
}

export interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timing: number;
  timestamp: number;
}

export class BrowserTools {
  private page: PlaywrightPage | null = null;
  private consoleLogs: ConsoleEntry[] = [];
  private networkLogs: NetworkEntry[] = [];

  /**
   * Attach to an existing page
   */
  attach(page: PlaywrightPage): void {
    this.page = page;
    this.attachListeners();
  }

  /**
   * Navigate to URL
   */
  async navigate(params: NavigateParams): Promise<{ url: string; title: string }> {
    if (!this.page) throw new Error('No active browser session');

    const response = await this.page.goto(params.url, {
      waitUntil: params.waitUntil ?? 'load',
      timeout: 30000
    });

    return {
      url: this.page.url(),
      title: await this.page.title()
    };
  }

  /**
   * Click element by selector
   */
  async click(params: ClickParams): Promise<void> {
    if (!this.page) throw new Error('No active browser session');

    await this.page.click(params.selector, {
      timeout: params.options?.timeout ?? 5000,
      force: params.options?.force
    });
  }

  /**
   * Scroll page or element
   */
  async scroll(params: ScrollParams): Promise<void> {
    if (!this.page) throw new Error('No active browser session');

    if (params.selector) {
      await this.page.evaluate((args: { selector?: string; x?: number; y?: number }) => {
        const el = document.querySelector(args.selector || '');
        if (el) el.scrollBy(args.x ?? 0, args.y ?? 100);
      }, params);
    } else {
      await this.page.evaluate((args: { x?: number; y?: number }) => {
        window.scrollBy(args.x ?? 0, args.y ?? 100);
      }, params);
    }
  }

  /**
   * Wait for selector
   */
  async wait(params: WaitParams): Promise<void> {
    if (!this.page) throw new Error('No active browser session');

    if (params.selector) {
      await this.page.waitForSelector(params.selector, {
        timeout: params.timeout ?? 10000,
        state: params.state ?? 'visible'
      });
    } else {
      await this.page.waitForTimeout(params.timeout ?? 1000);
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(params: ScreenshotParams): Promise<string> {
    if (!this.page) throw new Error('No active browser session');

    const opts: Record<string, unknown> = { type: 'png' };
    if (params.fullPage) opts.fullPage = true;

    if (params.selector) {
      const el = await this.page.$(params.selector);
      if (!el) throw new Error(`Element not found: ${params.selector}`);
      return await el.screenshot(opts) as unknown as string;
    }

    return await this.page.screenshot(opts) as unknown as string;
  }

  /**
   * Execute JavaScript in page context
   */
  async evaluate(params: EvaluateParams): Promise<unknown> {
    if (!this.page) throw new Error('No active browser session');

    return await this.page.evaluate(params.script);
  }

  /**
   * Get collected console logs
   */
  getConsoleLogs(): ConsoleEntry[] {
    return [...this.consoleLogs];
  }

  /**
   * Get collected network logs
   */
  getNetworkLogs(): NetworkEntry[] {
    return [...this.networkLogs];
  }

  /**
   * Clear collected logs
   */
  clearLogs(): void {
    this.consoleLogs = [];
    this.networkLogs = [];
  }

  /**
   * Detach from page
   */
  detach(): void {
    this.page = null;
    this.clearLogs();
  }

  /**
   * Check if attached
   */
  isAttached(): boolean {
    return this.page !== null;
  }

  private attachListeners(): void {
    if (!this.page) return;

    this.page.on('console', (msg: any) => {
      this.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now()
      });
    });

    this.page.on('response', (response: any) => {
      const request = response.request();
      this.networkLogs.push({
        url: request.url(),
        method: request.method(),
        status: response.status(),
        statusText: response.statusText(),
        timing: response.timing()?.responseEnd ?? 0,
        timestamp: Date.now()
      });
    });
  }
}
