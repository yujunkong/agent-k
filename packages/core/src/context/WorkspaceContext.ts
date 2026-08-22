/**
 * CTX-005 — WorkspaceContext stub (roots + open files list).
 * Host injects real workspace paths; core stays vscode-free.
 */

export interface WorkspaceRoot {
  name: string;
  path: string;
}

export interface WorkspaceContextSnapshot {
  roots: WorkspaceRoot[];
  openFiles: string[];
  activeFile?: string;
  cwd?: string;
}

/**
 * Mutable workspace snapshot for Plan/Agent context injection.
 * Not an indexer (CTX-006+) — just the live IDE surface.
 */
export class WorkspaceContext {
  private roots: WorkspaceRoot[] = [];
  private openFiles: string[] = [];
  private activeFile?: string;
  private cwd?: string;

  setRoots(roots: WorkspaceRoot[]): void {
    this.roots = roots.map((r) => ({ name: r.name, path: r.path }));
  }

  setOpenFiles(paths: string[]): void {
    this.openFiles = [...paths];
  }

  setActiveFile(path: string | undefined): void {
    this.activeFile = path;
  }

  setCwd(cwd: string | undefined): void {
    this.cwd = cwd;
  }

  snapshot(): WorkspaceContextSnapshot {
    return {
      roots: this.roots.map((r) => ({ ...r })),
      openFiles: [...this.openFiles],
      activeFile: this.activeFile,
      cwd: this.cwd,
    };
  }

  /** Markdown block for ContextAssembler sticky/system slots. */
  toPromptBlock(): string {
    const s = this.snapshot();
    if (s.roots.length === 0 && s.openFiles.length === 0) return '';
    const lines: string[] = ['## Workspace'];
    if (s.roots.length) {
      lines.push('Roots:');
      for (const r of s.roots) lines.push(`- ${r.name}: ${r.path}`);
    }
    if (s.cwd) lines.push(`CWD: ${s.cwd}`);
    if (s.activeFile) lines.push(`Active file: ${s.activeFile}`);
    if (s.openFiles.length) {
      lines.push('Open files:');
      for (const f of s.openFiles.slice(0, 40)) lines.push(`- ${f}`);
    }
    return lines.join('\n');
  }
}
