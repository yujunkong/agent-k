/**
 * PlanStorage - 계획 문서 저장/로드 (C5-T09)
 * 
 * 기본 경로: `.agentk/plans/PLAN-<slug>.md`
 * 설정 오버라이드 가능
 * 로드/리스트 API
 */
import * as vscode from 'vscode';

export interface StoredPlan {
  slug: string;
  title: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
  todoCount: number;
}

export class PlanStorage {
  private static readonly DEFAULT_DIR = '.agentk/plans';
  private static readonly RECENT_KEY = 'agent-k.recentPlans';
  private static readonly MAX_RECENT = 10;

  /**
   * Get the plan storage directory URI
   */
  static async getStorageUri(): Promise<vscode.Uri> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open');
    }
    const root = workspaceFolders[0].uri;
    const configPath = vscode.workspace.getConfiguration('agent-k').get<string>('plans.directory') || this.DEFAULT_DIR;
    return vscode.Uri.joinPath(root, configPath);
  }

  /**
   * Save a plan document to disk
   */
  static async savePlan(slug: string, title: string, content: string): Promise<StoredPlan> {
    const dir = await this.getStorageUri();
    await vscode.workspace.fs.createDirectory(dir);

    const filePath = vscode.Uri.joinPath(dir, `PLAN-${slug}.md`);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(filePath, encoder.encode(content));

    const plan: StoredPlan = {
      slug,
      title,
      filePath: filePath.fsPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      todoCount: (content.match(/- \[ \]/g) || []).length
    };

    await this.addToRecent(plan);
    return plan;
  }

  /**
   * Load a plan document from disk
   */
  static async loadPlan(slug: string): Promise<{ content: string; plan: StoredPlan } | null> {
    const dir = await this.getStorageUri();
    const filePath = vscode.Uri.joinPath(dir, `PLAN-${slug}.md`);

    try {
      const data = await vscode.workspace.fs.readFile(filePath);
      const decoder = new TextDecoder();
      const content = decoder.decode(data);

      const plan: StoredPlan = {
        slug,
        title: this.extractTitle(content) || slug,
        filePath: filePath.fsPath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        todoCount: (content.match(/- \[ \]/g) || []).length
      };

      return { content, plan };
    } catch {
      return null;
    }
  }

  /**
   * List all saved plans
   */
  static async listPlans(): Promise<StoredPlan[]> {
    const dir = await this.getStorageUri();
    try {
      const files = await vscode.workspace.fs.readDirectory(dir);
      const plans: StoredPlan[] = [];

      for (const [name, type] of files) {
        if (type === vscode.FileType.File && name.startsWith('PLAN-') && name.endsWith('.md')) {
          const slug = name.replace(/^PLAN-/, '').replace(/\.md$/, '');
          const loaded = await this.loadPlan(slug);
          if (loaded) plans.push(loaded.plan);
        }
      }

      return plans.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /**
   * Get recent plans from workspaceState
   */
  static getRecentPlans(): StoredPlan[] {
    const state = this.getWorkspaceState();
    return state.get<StoredPlan[]>(this.RECENT_KEY, []);
  }

  private static async addToRecent(plan: StoredPlan): Promise<void> {
    const state = this.getWorkspaceState();
    const recent = state.get<StoredPlan[]>(this.RECENT_KEY, []);
    const filtered = recent.filter(p => p.slug !== plan.slug);
    filtered.unshift(plan);
    if (filtered.length > this.MAX_RECENT) filtered.pop();
    await state.update(this.RECENT_KEY, filtered);
  }

  private static getWorkspaceState(): vscode.Memento {
    // Accessed via extension context
    return (vscode.extensions.getExtension('agent-k.extension')?.exports as any)?.workspaceState;
  }

  private static extractTitle(content: string): string {
    const match = content.match(/^# (.+)$/m);
    return match ? match[1].trim() : 'Untitled Plan';
  }
}
