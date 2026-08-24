/**
 * CTX-006 — Host-injectable workspace I/O port.
 * v2.1 WorkspaceIndexer used `vscode.workspace.findFiles` / `openTextDocument`;
 * core must stay vscode-free, so host (or tests) supply this surface.
 */

export interface WorkspaceTextFile {
  /** Absolute filesystem path. */
  fsPath: string;
  /** Full file text (same role as TextDocument.getText()). */
  text: string;
}

/**
 * Minimal FS port for WorkspaceIndexer.buildIndex.
 * Host typically wraps `vscode.workspace.findFiles` + openTextDocument.
 */
export interface WorkspaceFs {
  /**
   * Find workspace files matching the include glob, excluding ignore globs.
   * Paths should be absolute fs paths with readable text content.
   */
  findTextFiles(options: {
    include: string;
    exclude: string;
  }): Promise<WorkspaceTextFile[]>;
}
