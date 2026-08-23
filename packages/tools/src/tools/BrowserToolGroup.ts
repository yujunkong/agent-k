/**
 * TOOL-014 BrowserToolGroup — in-memory browser session (no Playwright yet).
 * Tracks URL/history/console so tools are usable before real automation lands.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

interface BrowserSession {
  url: string;
  title: string;
  history: string[];
  console: string[];
  lastSnapshotAt?: number;
}

const sessions = new Map<string, BrowserSession>();

function getOrCreate(sessionId: string): BrowserSession {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { url: 'about:blank', title: 'New Session', history: [], console: [] };
    sessions.set(sessionId, s);
  }
  return s;
}

function sessionIdOf(input: Record<string, unknown>): string {
  return String(input.sessionId ?? 'default');
}

export const browserNavigateTool: ToolDefinition = {
  name: 'browser_navigate',
  description:
    'Navigate the in-memory browser session to a URL (session state; no live browser yet).',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Target URL' },
      sessionId: { type: 'string', description: 'Browser session id (default: default)' },
    },
    required: ['url'],
  },
  permissionHint: 'network',
  timeoutMs: 15_000,
  cancelSupported: true,
  timelineEventType: 'browsing',
  modeAllowlist: ['agent', 'debug'],
  category: 'web',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const url = String(input.url ?? '').trim();
      if (!url) return { success: false, error: 'url required' };
      try {
        // Validate URL shape without fetching.
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        return { success: false, error: `Invalid URL: ${url}` };
      }
      const sid = sessionIdOf(input);
      const session = getOrCreate(sid);
      session.history.push(url);
      session.url = url;
      session.title = url;
      session.console.push(`[navigate] ${url}`);
      return {
        success: true,
        data: {
          status: 'navigated',
          sessionId: sid,
          url: session.url,
          title: session.title,
          historyLength: session.history.length,
          note: 'In-memory session only — Playwright wiring is Phase 3+.',
        },
      };
    });
  },
};

export const browserSnapshotTool: ToolDefinition = {
  name: 'browser_snapshot',
  description:
    'Take an accessibility-style snapshot of the current in-memory browser page.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      selector: { type: 'string', description: 'Optional CSS selector focus' },
    },
    required: [],
  },
  permissionHint: 'network',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'browsing',
  modeAllowlist: ['agent', 'debug'],
  category: 'web',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const sid = sessionIdOf(input);
      const session = getOrCreate(sid);
      session.lastSnapshotAt = Date.now();
      const selector = input.selector ? String(input.selector) : undefined;
      const snapshot = [
        `url: ${session.url}`,
        `title: ${session.title}`,
        selector ? `focus: ${selector}` : undefined,
        'role: document',
        `  name: ${session.title}`,
        `  text: (in-memory stub — no live DOM)`,
      ]
        .filter(Boolean)
        .join('\n');
      return {
        success: true,
        data: {
          status: 'snapshot',
          sessionId: sid,
          url: session.url,
          snapshot,
          console: session.console.slice(-20),
        },
      };
    });
  },
};

/** Reset sessions (tests). */
export function resetBrowserSessions(): void {
  sessions.clear();
}

function stubBrowserAction(
  name: string,
  description: string,
  required: string[] = []
): ToolDefinition {
  return {
    name,
    description: `${description} (in-memory session stub).`,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
        text: { type: 'string' },
        expression: { type: 'string' },
        pixels: { type: 'number' },
        ms: { type: 'number' },
        url: { type: 'string' },
      },
      required,
    },
    permissionHint: 'network',
    timeoutMs: 15_000,
    cancelSupported: true,
    timelineEventType: 'browsing',
    modeAllowlist: ['agent', 'debug'],
    category: 'web',
    async execute(input, ctx): Promise<ToolResult> {
      return withToolTiming(ctx.signal, async () => {
        const sid = sessionIdOf(input);
        const session = getOrCreate(sid);
        session.console.push(`[${name}] ${JSON.stringify(input).slice(0, 200)}`);
        return {
          success: true,
          data: {
            status: name.replace(/^browser_/, ''),
            sessionId: sid,
            url: session.url,
            note: 'In-memory stub — Playwright wiring is Phase 3+.',
          },
        };
      });
    },
  };
}

export const browserClickTool = stubBrowserAction(
  'browser_click',
  'Click an element in the browser session',
  []
);
export const browserScreenshotTool = stubBrowserAction(
  'browser_screenshot',
  'Capture a screenshot of the browser session'
);
export const browserEvaluateTool = stubBrowserAction(
  'browser_evaluate',
  'Evaluate JS in the browser session'
);
export const browserConsoleTool = stubBrowserAction(
  'browser_console',
  'Read recent browser console messages'
);
export const browserNetworkTool = stubBrowserAction(
  'browser_network',
  'Read recent network activity from the browser session'
);
export const browserScrollTool = stubBrowserAction(
  'browser_scroll',
  'Scroll the browser session'
);
export const browserWaitTool = stubBrowserAction(
  'browser_wait',
  'Wait in the browser session'
);

export const browserToolGroup: ToolDefinition[] = [
  browserNavigateTool,
  browserSnapshotTool,
  browserClickTool,
  browserScreenshotTool,
  browserEvaluateTool,
  browserConsoleTool,
  browserNetworkTool,
  browserScrollTool,
  browserWaitTool,
];
