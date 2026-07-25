/**
 * PlanStorage - 계획 문서 저장/로드 (C5-T09 / RW-C5-06-R2)
 *
 * 착각 금지: .agentk/plans 경로 문자열만으로는 미완료.
 * ExtensionContext.workspaceState는 activate → RuntimeServices로 실주입 (fake exports 제거).
 */
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
  private static readonly DEFAULT_DIR = '.agentk/plans';
  private static readonly RECENT_KEY = 'agent-k.recentPlans';
  private static readonly MAX_RECENT = 10;

  /**
   * Optional direct inject (tests). Prefer RuntimeServices from activate.
   */
  static setExtensionContext(context: vscode.ExtensionContext): void {
    RuntimeServices.setWorkspaceState(context.workspaceState);
  }

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
   * Get recent plans from injected workspaceState (max 10)
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
    // Keep only the 10 most recent plans (AC)
    if (filtered.length > this.MAX_RECENT) filtered.length = this.MAX_RECENT;
    await state.update(this.RECENT_KEY, filtered);
  }

  /**
   * RW-C5-06-R2: Use RuntimeServices Memento — never extension.exports fake
   */
  private static getWorkspaceState(): vscode.Memento {
    const state = RuntimeServices.getWorkspaceState();
    if (!state) {
      throw new Error(
        'PlanStorage not initialized. Call RuntimeServices.setWorkspaceState(context.workspaceState) from extension.activate().'
      );
    }
    return state;
  }

  private static extractTitle(content: string): string {
    const match = content.match(/^# (.+)$/m);
    return match ? match[1].trim() : 'Untitled Plan';
  }
}
