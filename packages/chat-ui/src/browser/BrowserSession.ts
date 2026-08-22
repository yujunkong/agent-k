/**
 * BrowserSession — 영구 브라우저 세션 관리 (C7-T02)
 *
 * 세션 풀: max 3, LRU eviction
 * 쿠키/스토리지 유지
 * 전체 메모리 < 800MB
 *
 * NOTE: Playwright is optional. Install with `npm install playwright` to enable.
 */
import { BrowserTools } from './BrowserTools';

// Playwright types — use `any` to avoid hard dependency
type PlaywrightBrowser = any;
type PlaywrightContext = any;
type PlaywrightPage = any;

export interface BrowserSessionInfo {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  lastUsedAt: number;
  toolCount: number;
}

const MAX_SESSIONS = 3;
const MEMORY_LIMIT_MB = 800;

export class BrowserSessionManager {
  private sessions: Map<string, { context: PlaywrightContext; page: PlaywrightPage; tools: BrowserTools; info: BrowserSessionInfo }> = new Map();
  private browser: PlaywrightBrowser | null = null;
  private accessOrder: string[] = [];

  /**
   * Initialize browser (lazy)
   */
  async init(): Promise<void> {
    if (!this.browser) {
      try {
        // Dynamic import — Playwright is optional
        const pw: any = await import('playwright' as any);
        this.browser = await pw.chromium.launch({
          headless: true,
          args: ['--disable-dev-shm-usage', '--no-sandbox']
        });
      } catch {
        console.warn('[BrowserSession] Playwright not available. Install with: npm install playwright');
      }
    }
  }

  /**
   * Create a new browser session (stub — requires Playwright installed)
   */
  async createSession(): Promise<{ id: string; page: PlaywrightPage; tools: BrowserTools }> {
    await this.init();

    // Evict LRU if at max capacity
    if (this.sessions.size >= MAX_SESSIONS) {
      await this.evictLRU();
    }

    if (!this.browser) {
      // Try to dynamically import playwright
      try {
        const pw: any = await import('playwright' as any);
        this.browser = await pw.chromium.launch({
          headless: true,
          args: ['--disable-dev-shm-usage', '--no-sandbox']
        });
      } catch {
        throw new Error('Playwright is not installed. Run: npm install playwright');
      }
    }

    const context = await this.browser!.newContext();
    const page = await context.newPage();
    const tools = new BrowserTools();
    tools.attach(page);

    const id = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const info: BrowserSessionInfo = {
      id,
      url: 'about:blank',
      title: 'New Tab',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      toolCount: 0
    };

    this.sessions.set(id, { context, page, tools, info });
    this.accessOrder.push(id);
    this.accessOrder = [...new Set(this.accessOrder)]; // unique

    return { id, page, tools };
  }

  /**
   * Get an existing session by ID — updates LRU order
   */
  getSession(id: string): { page: PlaywrightPage; tools: BrowserTools; info: BrowserSessionInfo } | null {
    const session = this.sessions.get(id);
    if (!session) return null;

    // Update LRU: move to end
    this.accessOrder = this.accessOrder.filter(sid => sid !== id);
    this.accessOrder.push(id);
    session.info.lastUsedAt = Date.now();

    return { page: session.page, tools: session.tools, info: session.info };
  }

  /**
   * Get all session infos
   */
  listSessions(): BrowserSessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  /**
   * Close and remove a specific session
   */
  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    session.tools.detach();
    await session.page.close();
    await session.context.close();

    this.sessions.delete(id);
    this.accessOrder = this.accessOrder.filter(sid => sid !== id);
  }

  /**
   * Close all sessions and browser
   */
  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.closeSession(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Update session info (e.g., after navigation)
   */
  updateSessionInfo(id: string, updates: Partial<BrowserSessionInfo>): void {
    const session = this.sessions.get(id);
    if (!session) return;

    Object.assign(session.info, updates);
    session.info.lastUsedAt = Date.now();
  }

  /**
   * Increment tool count
   */
  incrementToolCount(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.info.toolCount++;
      session.info.lastUsedAt = Date.now();
    }
  }

  /**
   * Get active session count
   */
  get activeCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if any sessions exist
   */
  get hasSessions(): boolean {
    return this.sessions.size > 0;
  }

  /**
   * Estimate memory usage (rough: 200MB per context base + page)
   */
  estimateMemoryMB(): number {
    return this.sessions.size * 200;
  }

  /**
   * Check if memory is within limits
   */
  isMemorySafe(): boolean {
    return this.estimateMemoryMB() < MEMORY_LIMIT_MB;
  }

  private async evictLRU(): Promise<void> {
    const oldest = this.accessOrder[0];
    if (oldest) {
      await this.closeSession(oldest);
    }
  }
}
