/**
 * ART-001 / BROWSER-001~003 / DESIGN-001~002 / GH-001~003 unit tests (v2.1 동작 동등)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArtifactStore } from '../artifacts/ArtifactStore';
import { BrowserTools } from '../browser/BrowserTools';
import { BrowserSessionManager } from '../browser/BrowserSession';
import { BrowserEvidenceCollector } from '../browser/BrowserEvidenceCollector';
import { DesignModeOverlay } from '../browser/DesignModeOverlay';
import { DesignModeContext } from '../browser/DesignModeContext';
import { GitHubAgent } from '../github/GitHubAgent';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentk-art-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ART-001 ArtifactStore', () => {
  it('saves and retrieves artifacts', () => {
    const store = new ArtifactStore(path.join(tmpDir, 'arts'));
    const art = store.saveDiff('diff-content', 'My Diff');
    expect(art.id).toMatch(/^art-/);
    expect(store.get(art.id)?.title).toBe('My Diff');
    expect(store.count).toBe(1);
  });

  it('saveScreenshot builds png file path and tags', () => {
    const store = new ArtifactStore(path.join(tmpDir, 'arts'));
    const art = store.saveScreenshot('base64data', 'Shot 1');
    expect(art.type).toBe('screenshot');
    expect(art.filePath).toBe('screenshots/Shot_1.png');
    expect(art.tags).toContain('screenshot');
  });

  it('getAll sorts by timestamp desc and persists across instances', async () => {
    const dir = path.join(tmpDir, 'arts');
    const store = new ArtifactStore(dir);
    store.saveDiff('a', 'First');
    await new Promise((r) => setTimeout(r, 5)); // distinct timestamps
    store.saveDiff('b', 'Second');
    const reloaded = new ArtifactStore(dir);
    const all = reloaded.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].title).toBe('Second');
  });

  it('delete and clear remove artifacts', () => {
    const store = new ArtifactStore(path.join(tmpDir, 'arts'));
    const art = store.saveDiff('x', 'X');
    store.delete(art.id);
    expect(store.count).toBe(0);
    store.saveDiff('y', 'Y');
    store.clear();
    expect(store.count).toBe(0);
  });

  it('exportGallery renders markdown', () => {
    const store = new ArtifactStore(path.join(tmpDir, 'arts'));
    expect(store.exportGallery()).toBe('No artifacts yet.');
    store.saveDiff('x', 'X');
    expect(store.exportGallery()).toContain('## Artifact Gallery');
    expect(store.exportGallery()).toContain('**X**');
  });
});

describe('BROWSER-002 BrowserTools', () => {
  it('throws without active session', async () => {
    const tools = new BrowserTools();
    await expect(tools.navigate({ url: 'https://x' })).rejects.toThrow('No active browser session');
    expect(tools.isAttached()).toBe(false);
  });

  it('attach/detach manages state and collects logs', () => {
    const tools = new BrowserTools();
    const listeners: Record<string, (msg: unknown) => void> = {};
    const fakePage: Record<string, unknown> = {
      on: (event: string, cb: (msg: unknown) => void) => {
        listeners[event] = cb;
      },
      url: () => 'https://example.com',
      title: async () => 'Example',
    };
    tools.attach(fakePage);
    expect(tools.isAttached()).toBe(true);

    listeners['console']({ type: () => 'log', text: () => 'hello' });
    expect(tools.getConsoleLogs()).toHaveLength(1);
    expect(tools.getConsoleLogs()[0].text).toBe('hello');

    listeners['response']({
      request: () => ({ url: () => 'https://example.com', method: () => 'GET' }),
      status: () => 200,
      statusText: () => 'OK',
      timing: () => ({ responseEnd: 12 }),
    });
    expect(tools.getNetworkLogs()).toHaveLength(1);
    expect(tools.getNetworkLogs()[0].status).toBe(200);

    tools.detach();
    expect(tools.isAttached()).toBe(false);
    expect(tools.getConsoleLogs()).toHaveLength(0);
  });
});

describe('BROWSER-001 BrowserSessionManager', () => {
  it('createSession throws with guidance when Playwright missing', async () => {
    const mgr = new BrowserSessionManager();
    await expect(mgr.createSession()).rejects.toThrow('Playwright is not installed');
  });

  it('memory estimate and safety', () => {
    const mgr = new BrowserSessionManager();
    expect(mgr.activeCount).toBe(0);
    expect(mgr.estimateMemoryMB()).toBe(0);
    expect(mgr.isMemorySafe()).toBe(true);
  });
});

describe('BROWSER-003 BrowserEvidenceCollector', () => {
  it('reports missing session manager', async () => {
    const collector = new BrowserEvidenceCollector();
    const evidence = await collector.captureScreenshot('test');
    expect(evidence.data).toContain('BrowserSessionManager not available');
    expect(collector.getAllEvidence()).toHaveLength(1);
  });

  it('formatEvidenceBlock renders console/network blocks', async () => {
    const collector = new BrowserEvidenceCollector();
    await collector.captureConsole('console-test', 'sess-1');
    const block = collector.formatEvidenceBlock();
    expect(block).toContain('## Browser Evidence');
    expect(block).toContain('console: console-test');
  });

  it('clear resets evidence', async () => {
    const collector = new BrowserEvidenceCollector();
    await collector.captureNetwork('net', 'sess-1');
    collector.clear();
    expect(collector.getAllEvidence()).toHaveLength(0);
  });
});

describe('DESIGN-001/002 DesignModeOverlay + Context', () => {
  it('local snapshot when no Playwright session', () => {
    const overlay = new DesignModeOverlay();
    const snapshot = overlay.ensureLocalSnapshot();
    expect(snapshot.url).toBe('design://local');
    expect(overlay.getLastSnapshot()).toBe(snapshot);
  });

  it('annotations and context export', () => {
    const overlay = new DesignModeOverlay();
    overlay.ensureLocalSnapshot();
    overlay.addAnnotation({ x: 10, y: 20, width: 100, height: 50, comment: 'fix spacing' });
    expect(overlay.getAnnotations()).toHaveLength(1);

    const ctx = new DesignModeContext(overlay);
    const payload = ctx.buildContext();
    expect(payload?.hasAnnotations).toBe(true);
    expect(payload?.contextBlock).toContain('fix spacing');

    const injected = ctx.injectContext('base prompt');
    expect(injected.injected).toBe(true);
    expect(injected.prompt).toContain('Design Mode Context');
  });

  it('no annotations → no injection', () => {
    const overlay = new DesignModeOverlay();
    overlay.ensureLocalSnapshot();
    const ctx = new DesignModeContext(overlay);
    const injected = ctx.injectContext('base');
    expect(injected.injected).toBe(false);
  });

  it('truncated context limits annotations', () => {
    const overlay = new DesignModeOverlay();
    for (let i = 0; i < 8; i++) {
      overlay.addAnnotation({ x: i, y: i, width: 1, height: 1, comment: `c${i}` });
    }
    const truncated = overlay.exportTruncatedContext(3);
    expect(truncated).toContain('last 3');
    expect(truncated).toContain('c7');
    expect(truncated).not.toContain('c4');
  });
});

describe('GH-001~003 GitHubAgent', () => {
  it('checkAuth returns structured result when gh missing', async () => {
    // gh may or may not be installed — both outcomes are valid structured results
    const agent = new GitHubAgent(tmpDir);
    const result = await agent.checkAuth();
    expect(typeof result.authenticated).toBe('boolean');
    if (!result.authenticated) {
      expect(result.error).toBeDefined();
    }
  });

  it('execGh throws human-readable error for missing gh', async () => {
    const agent = new GitHubAgent(tmpDir);
    // listIssues with a fake gh path — ENOENT path throws with install guidance
    // Only assert when gh is genuinely unavailable
    const which = require('child_process') as typeof import('child_process');
    let ghAvailable = true;
    try {
      which.execFileSync('gh', ['--version'], { stdio: 'ignore' });
    } catch {
      ghAvailable = false;
    }
    if (!ghAvailable) {
      await expect(agent.listIssues()).rejects.toThrow('GitHub CLI (gh) is not installed');
    }
  });
});
