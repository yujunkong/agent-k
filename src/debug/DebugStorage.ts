/**
 * DebugStorage — session reports under the single project root `.agentk/`:
 *   `<workspace>/.agentk/debug/tmp/debug_<hash>.md`
 * Settings and other agent data also live under `.agentk/` (see AGENTK_DIR).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { RuntimeServices } from '../core/RuntimeServices';

export interface StoredDebugSession {
  slug: string;
  title: string;
  filePath: string;
  stage?: string;
  createdAt: number;
  updatedAt: number;
}

export class DebugStorage {
  private static readonly REL_TMP_DIR = path.join('.agentk', 'debug', 'tmp');
  private static readonly RECENT_KEY = 'agent-k.recentDebugSessions';
  private static readonly MAX_RECENT = 10;

  static setExtensionContext(context: vscode.ExtensionContext): void {
    RuntimeServices.setWorkspaceState(context.workspaceState);
  }

  static makeDebugId(content: string, title?: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${Date.now()}\n${title || ''}\n${content}`)
      .digest('hex')
      .slice(0, 10);
    return `debug_${hash}`;
  }

  static getWorkspaceRootFsPath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error(
        'No workspace folder. Open a project folder, then save Debug.'
      );
    }
    return folders[0].uri.fsPath;
  }

  /** Absolute: `<workspaceRoot>/.agentk/debug/tmp` */
  static getTempDirFsPath(): string {
    return path.join(this.getWorkspaceRootFsPath(), this.REL_TMP_DIR);
  }

  /**
   * Save debug session markdown → `.agentk/debug/tmp/debug_<hash>.md`
   * Pass existingSlug to update the same file in place.
   */
  static async saveSession(
    title: string,
    content: string,
    opts?: { existingSlug?: string; stage?: string }
  ): Promise<StoredDebugSession> {
    const body = String(content || '').trim();
    if (!body) {
      throw new Error('Debug session content is empty — nothing was saved.');
    }

    const tmpDir = this.getTempDirFsPath();
    fs.mkdirSync(tmpDir, { recursive: true });

    const existing = opts?.existingSlug;
    const slug =
      existing && /^debug_[a-f0-9]+$/i.test(existing)
        ? existing
        : this.makeDebugId(body, title);
    const absPath = path.join(tmpDir, `${slug}.md`);

    const header = [
      '---',
      `title: ${JSON.stringify(title || 'Debug Session')}`,
      `slug: ${slug}`,
      `stage: ${JSON.stringify(opts?.stage || '')}`,
      `updatedAt: ${new Date().toISOString()}`,
      '---',
      '',
      body,
      ''
    ].join('\n');

    fs.writeFileSync(absPath, header, 'utf8');

    const stored: StoredDebugSession = {
      slug,
      title: title || 'Debug Session',
      filePath: absPath,
      stage: opts?.stage,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await this.addToRecent(stored);
    } catch (e) {
      console.warn('[DebugStorage] addToRecent failed (file still saved):', e);
    }
    return stored;
  }

  /** Optional sidecar: reproduce steps next to the session file */
  static async saveSidecar(
    slug: string,
    name: 'reproduce' | 'logs' | 'cleanup',
    content: string
  ): Promise<string | null> {
    const body = String(content || '').trim();
    if (!body || !/^debug_[a-f0-9]+$/i.test(slug)) return null;
    const tmpDir = this.getTempDirFsPath();
    fs.mkdirSync(tmpDir, { recursive: true });
    const absPath = path.join(tmpDir, `${slug}.${name}.md`);
    fs.writeFileSync(absPath, body + '\n', 'utf8');
    return absPath;
  }

  static getRecentSessions(): StoredDebugSession[] {
    const state = this.getWorkspaceState();
    return state.get<StoredDebugSession[]>(this.RECENT_KEY, []);
  }

  private static async addToRecent(session: StoredDebugSession): Promise<void> {
    const state = this.getWorkspaceState();
    const recent = state.get<StoredDebugSession[]>(this.RECENT_KEY, []);
    const filtered = recent.filter((p) => p.slug !== session.slug);
    filtered.unshift(session);
    if (filtered.length > this.MAX_RECENT) filtered.length = this.MAX_RECENT;
    await state.update(this.RECENT_KEY, filtered);
  }

  private static getWorkspaceState(): vscode.Memento {
    const state = RuntimeServices.getWorkspaceState();
    if (!state) {
      throw new Error(
        'DebugStorage not initialized. Call RuntimeServices.setWorkspaceState from activate().'
      );
    }
    return state;
  }
}
