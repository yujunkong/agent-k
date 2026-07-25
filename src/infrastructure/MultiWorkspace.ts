/**
 * MultiWorkspace - 멀티 워크스페이스 지원 (C4-T31)
 */
import * as vscode from 'vscode';

interface WorkspaceInfo {
  uri: vscode.Uri;
  name: string;
  isActive: boolean;
}

export class MultiWorkspace {
  private workspaces: WorkspaceInfo[] = [];
  private activeWorkspaceIdx = 0;

  constructor() {
    this.refreshWorkspaces();
  }

  refreshWorkspaces(): void {
    const folders = vscode.workspace.workspaceFolders || [];
    this.workspaces = folders.map((f, i) => ({
      uri: f.uri,
      name: f.name,
      isActive: i === this.activeWorkspaceIdx
    }));
  }

  getActiveWorkspace(): WorkspaceInfo | undefined {
    return this.workspaces[this.activeWorkspaceIdx];
  }

  switchWorkspace(index: number): boolean {
    if (index < 0 || index >= this.workspaces.length) return false;
    this.workspaces.forEach((w, i) => w.isActive = i === index);
    this.activeWorkspaceIdx = index;
    return true;
  }

  getAllWorkspaces(): WorkspaceInfo[] {
    return [...this.workspaces];
  }

  getWorkspaceCount(): number {
    return this.workspaces.length;
  }
}
