/**
 * PlanStorage — drafts under the single project root `.agentk/`:
 *   `<workspace>/.agentk/plans/tmp/plan_<hash>.md`
 * Settings and other agent data also live under `.agentk/` (see AGENTK_DIR).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { RuntimeServices } from '../core/RuntimeServices';

export interface StoredPlan {
  slug: string;
  title: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
  todoCount: number;
}

export class PlanStorage {
  /** Relative to workspace root */
  private static readonly REL_TMP_DIR = path.join('.agentk', 'plans', 'tmp');
  private static readonly RECENT_KEY = 'agent-k.recentPlans';
  private static readonly MAX_RECENT = 10;

  static setExtensionContext(context: vscode.ExtensionContext): void {
    RuntimeServices.setWorkspaceState(context.workspaceState);
  }

  /** Unique id → `plan_<hash>` filename stem */
  static makePlanId(content: string, title?: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${Date.now()}\n${title || ''}\n${content}`)
      .digest('hex')
      .slice(0, 10);
    return `plan_${hash}`;
  }

  /** Absolute path: `<workspaceRoot>/.agentk/plans/tmp` */
  static getTempDirFsPath(): string {
    const root = this.getWorkspaceRootFsPath();
    return path.join(root, this.REL_TMP_DIR);
  }

  static getWorkspaceRootFsPath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error(
        'No workspace folder. Open a project folder, then save the Plan.'
      );
    }
    // Prefer folder that looks like the active project (first is fine for single-root)
    return folders[0].uri.fsPath;
  }

  static async getTempStorageUri(): Promise<vscode.Uri> {
    return vscode.Uri.file(this.getTempDirFsPath());
  }

  static async getStorageUri(): Promise<vscode.Uri> {
    const root = this.getWorkspaceRootFsPath();
    return vscode.Uri.file(path.join(root, '.agentk', 'plans'));
  }

  /**
   * Save draft → `<workspace>/.agentk/plans/tmp/plan_<hash>.md`
   * Uses Node fs (mkdir recursive) so the temp folder always appears at project root.
   */
  static async savePlan(
    title: string,
    content: string,
    existingSlug?: string
  ): Promise<StoredPlan> {
    const body = String(content || '').trim();
    if (!body) {
      throw new Error('Plan content is empty — nothing was saved.');
    }

    const tmpDir = this.getTempDirFsPath();
    fs.mkdirSync(tmpDir, { recursive: true });

    const slug =
      existingSlug && /^plan_[a-f0-9]+$/i.test(existingSlug)
        ? existingSlug
        : this.makePlanId(body, title);
    const fileName = `${slug}.md`;
    const absPath = path.join(tmpDir, fileName);

    const header = [
      '---',
      `title: ${JSON.stringify(title || 'Plan')}`,
      `slug: ${slug}`,
      `updatedAt: ${new Date().toISOString()}`,
      '---',
      '',
      body,
      ''
    ].join('\n');

    fs.writeFileSync(absPath, header, 'utf8');

    const plan: StoredPlan = {
      slug,
      title: title || this.extractTitle(body) || slug,
      filePath: absPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      todoCount: (body.match(/- \[[ xX]\]/g) || []).length
    };

    try {
      await this.addToRecent(plan);
    } catch (e) {
      console.warn('[PlanStorage] addToRecent failed (file still saved):', e);
    }
    return plan;
  }

  static async loadPlan(slug: string): Promise<{ content: string; plan: StoredPlan } | null> {
    const candidates = [
      path.join(this.getTempDirFsPath(), `${slug}.md`),
      path.join(this.getWorkspaceRootFsPath(), '.agentk', 'plans', `PLAN-${slug}.md`),
      path.join(this.getWorkspaceRootFsPath(), '.agentk', 'plans', `${slug}.md`)
    ];

    for (const filePath of candidates) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8');
        const content = this.stripFrontmatter(raw);
        return {
          content,
          plan: {
            slug,
            title: this.extractTitle(content) || slug,
            filePath,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            todoCount: (content.match(/- \[[ xX]\]/g) || []).length
          }
        };
      } catch {
        /* try next */
      }
    }
    return null;
  }

  static async listPlans(): Promise<StoredPlan[]> {
    const plans: StoredPlan[] = [];
    const seen = new Set<string>();

    const collect = (dir: string, pattern: RegExp) => {
      try {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
          if (!pattern.test(name)) continue;
          const slug = name.replace(/\.md$/, '').replace(/^PLAN-/, '');
          if (seen.has(slug)) continue;
          // sync load
          const filePath = path.join(dir, name);
          const raw = fs.readFileSync(filePath, 'utf8');
          const content = this.stripFrontmatter(raw);
          seen.add(slug);
          plans.push({
            slug,
            title: this.extractTitle(content) || slug,
            filePath,
            createdAt: Date.now(),
            updatedAt: fs.statSync(filePath).mtimeMs,
            todoCount: (content.match(/- \[[ xX]\]/g) || []).length
          });
        }
      } catch {
        /* missing */
      }
    };

    collect(this.getTempDirFsPath(), /^plan_[a-f0-9]+\.md$/i);
    collect(
      path.join(this.getWorkspaceRootFsPath(), '.agentk', 'plans'),
      /^PLAN-.+\.md$/i
    );

    return plans.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  static getRecentPlans(): StoredPlan[] {
    const state = this.getWorkspaceState();
    return state.get<StoredPlan[]>(this.RECENT_KEY, []);
  }

  private static async addToRecent(plan: StoredPlan): Promise<void> {
    const state = this.getWorkspaceState();
    const recent = state.get<StoredPlan[]>(this.RECENT_KEY, []);
    const filtered = recent.filter((p) => p.slug !== plan.slug);
    filtered.unshift(plan);
    if (filtered.length > this.MAX_RECENT) filtered.length = this.MAX_RECENT;
    await state.update(this.RECENT_KEY, filtered);
  }

  private static getWorkspaceState(): vscode.Memento {
    const state = RuntimeServices.getWorkspaceState();
    if (!state) {
      throw new Error(
        'PlanStorage not initialized. Call RuntimeServices.setWorkspaceState from activate().'
      );
    }
    return state;
  }

  private static extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : 'Untitled Plan';
  }

  /** True for Agent K plan drafts under `.agentk/plans/**` */
  static isPlanDocumentUri(uri: vscode.Uri): boolean {
    const normalized = uri.fsPath.replace(/\\/g, '/');
    if (!normalized.includes('/.agentk/plans/')) return false;
    const base = path.basename(normalized);
    return /^plan_[a-f0-9]+\.md$/i.test(base) || /^PLAN-.+\.md$/i.test(base);
  }

  static slugFromUri(uri: vscode.Uri): string {
    return path
      .basename(uri.fsPath)
      .replace(/\.md$/i, '')
      .replace(/^PLAN-/i, '');
  }

  static titleFromContent(content: string): string {
    return this.extractTitle(content);
  }

  static stripFrontmatter(raw: string): string {
    if (!raw.startsWith('---')) return raw;
    const end = raw.indexOf('\n---', 3);
    if (end < 0) return raw;
    return raw.slice(end + 4).replace(/^\s+/, '');
  }
}
