/**
 * browser_* 도구 그룹 — Tool Registry 등록용 스키마/핸들러 (C7-T05)
 *
 * Tier A deny: 이 도구들은 Flash 모델에서 숨김 처리
 */
import { z } from 'zod';
import { BrowserSessionManager } from '../../browser/BrowserSession';
import type { NavigateParams, ClickParams, ScrollParams, WaitParams, ScreenshotParams, EvaluateParams } from '../../browser/BrowserTools';

// ===== Schema Definitions =====

export const browserNavigateSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  url: z.string().url().describe('Target URL to navigate to'),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().default('load')
});

export const browserClickSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector to click'),
  timeout: z.number().optional().default(5000),
  force: z.boolean().optional().default(false)
});

export const browserScrollSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().optional().describe('CSS selector of element to scroll (optional, defaults to window)'),
  x: z.number().optional().default(0),
  y: z.number().optional().default(100)
});

export const browserWaitSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().optional().describe('CSS selector to wait for (optional)'),
  timeout: z.number().optional().default(10000),
  state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().default('visible')
});

export const browserScreenshotSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().optional().describe('CSS selector of element to capture (optional, defaults to viewport)'),
  fullPage: z.boolean().optional().default(false)
});

export const browserEvaluateSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  script: z.string().describe('JavaScript code to execute in page context'),
  args: z.array(z.unknown()).optional().default([])
});

export const browserConsoleSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  clear: z.boolean().optional().default(false)
});

export const browserNetworkSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  clear: z.boolean().optional().default(false)
});

// ===== Schema Map =====

export const BROWSER_TOOL_SCHEMAS: Record<string, z.ZodObject<any>> = {
  browser_navigate: browserNavigateSchema,
  browser_click: browserClickSchema,
  browser_scroll: browserScrollSchema,
  browser_wait: browserWaitSchema,
  browser_screenshot: browserScreenshotSchema,
  browser_evaluate: browserEvaluateSchema,
  browser_console: browserConsoleSchema,
  browser_network: browserNetworkSchema
};

// ===== Tool Handlers =====

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class BrowserToolHandlers {
  private sessionManager: BrowserSessionManager;

  constructor(sessionManager: BrowserSessionManager) {
    this.sessionManager = sessionManager;
  }

  async handleNavigate(params: z.infer<typeof browserNavigateSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      const result = await session.tools.navigate({ url: params.url, waitUntil: params.waitUntil });
      this.sessionManager.updateSessionInfo(params.sessionId, {
        url: result.url,
        title: result.title
      });
      this.sessionManager.incrementToolCount(params.sessionId);

      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleClick(params: z.infer<typeof browserClickSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      await session.tools.click({ selector: params.selector, options: { timeout: params.timeout, force: params.force } });
      this.sessionManager.incrementToolCount(params.sessionId);
      return { success: true, data: `Clicked: ${params.selector}` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleScroll(params: z.infer<typeof browserScrollSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      await session.tools.scroll({ selector: params.selector, x: params.x, y: params.y });
      this.sessionManager.incrementToolCount(params.sessionId);
      return { success: true, data: `Scrolled by (${params.x}, ${params.y})` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleWait(params: z.infer<typeof browserWaitSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      await session.tools.wait({ selector: params.selector, timeout: params.timeout, state: params.state });
      this.sessionManager.incrementToolCount(params.sessionId);
      return { success: true, data: 'Wait completed' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleScreenshot(params: z.infer<typeof browserScreenshotSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      const screenshot = await session.tools.screenshot({ selector: params.selector, fullPage: params.fullPage });
      this.sessionManager.incrementToolCount(params.sessionId);
      return { success: true, data: { base64: screenshot, format: 'png' } };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleEvaluate(params: z.infer<typeof browserEvaluateSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      const result = await session.tools.evaluate({ script: params.script, args: params.args });
      this.sessionManager.incrementToolCount(params.sessionId);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleConsole(params: z.infer<typeof browserConsoleSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      const logs = session.tools.getConsoleLogs();
      if (params.clear) session.tools.clearLogs();
      return { success: true, data: logs };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleNetwork(params: z.infer<typeof browserNetworkSchema>): Promise<ToolResult> {
    try {
      const session = this.sessionManager.getSession(params.sessionId);
      if (!session) return { success: false, error: `Browser session not found: ${params.sessionId}` };

      const logs = session.tools.getNetworkLogs();
      if (params.clear) session.tools.clearLogs();
      return { success: true, data: logs };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}

// ===== Tool-to-Handler Mapping =====

export const BROWSER_TOOL_HANDLERS: Record<string, keyof BrowserToolHandlers> = {
  browser_navigate: 'handleNavigate',
  browser_click: 'handleClick',
  browser_scroll: 'handleScroll',
  browser_wait: 'handleWait',
  browser_screenshot: 'handleScreenshot',
  browser_evaluate: 'handleEvaluate',
  browser_console: 'handleConsole',
  browser_network: 'handleNetwork'
};

// ===== Tool Metadata =====

export interface BrowserToolMeta {
  name: string;
  description: string;
  tierAccess: 'A' | 'B' | 'C';
  category: 'browser';
}

export const BROWSER_TOOL_META: Record<string, BrowserToolMeta> = {
  browser_navigate: { name: 'browser_navigate', description: 'Navigate browser to a URL', tierAccess: 'B', category: 'browser' },
  browser_click: { name: 'browser_click', description: 'Click element by CSS selector', tierAccess: 'B', category: 'browser' },
  browser_scroll: { name: 'browser_scroll', description: 'Scroll page or element', tierAccess: 'B', category: 'browser' },
  browser_wait: { name: 'browser_wait', description: 'Wait for selector or timeout', tierAccess: 'B', category: 'browser' },
  browser_screenshot: { name: 'browser_screenshot', description: 'Take screenshot of page or element', tierAccess: 'B', category: 'browser' },
  browser_evaluate: { name: 'browser_evaluate', description: 'Execute JS in page context', tierAccess: 'B', category: 'browser' },
  browser_console: { name: 'browser_console', description: 'Get captured console logs', tierAccess: 'B', category: 'browser' },
  browser_network: { name: 'browser_network', description: 'Get captured network requests', tierAccess: 'B', category: 'browser' }
};
