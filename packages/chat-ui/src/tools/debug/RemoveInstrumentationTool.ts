/**
 * RemoveInstrumentationTool - DEBUG_INSTRUMENT 마커 실파일 제거 (C6-T11 / RW-C6-02-R2)
 */
import * as fs from 'fs';
import * as path from 'path';

export class RemoveInstrumentationTool {
  /**
   * Strip DEBUG_INSTRUMENT marker lines (+ following console.log / if-block line) from content
   */
  stripMarkers(content: string, hypothesisId?: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    const markerRe = hypothesisId
      ? new RegExp(`DEBUG_INSTRUMENT:\\s*${hypothesisId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      : /DEBUG_INSTRUMENT:/;

    for (let i = 0; i < lines.length; i++) {
      if (markerRe.test(lines[i])) {
        // Skip marker line and the next instrumented statement line if present
        if (i + 1 < lines.length && /console\.log\(|if \(/.test(lines[i + 1])) {
          i++;
        }
        continue;
      }
      result.push(lines[i]);
    }
    return result.join('\n');
  }

  /**
   * Count remaining DEBUG_INSTRUMENT markers in content
   */
  countRemaining(content: string, hypothesisId?: string): number {
    if (hypothesisId) {
      const specificRegex = new RegExp(`DEBUG_INSTRUMENT:\\s*${hypothesisId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      return (content.match(specificRegex) || []).length;
    }
    return (content.match(/DEBUG_INSTRUMENT:/g) || []).length;
  }

  /**
   * Verify zero remaining markers
   */
  verifyClean(content: string, hypothesisId?: string): { clean: boolean; remaining: number } {
    const remaining = this.countRemaining(content, hypothesisId);
    return { clean: remaining === 0, remaining };
  }

  private resolveRoot(root?: string): string {
    if (root) return root;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscode = require('vscode') as typeof import('vscode');
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) return folders[0].uri.fsPath;
    } catch { /* unit tests */ }
    return process.cwd();
  }

  /**
   * RW-C6-02-R2: Walk workspace and remove DEBUG_INSTRUMENT markers from real files
   */
  async removeFromWorkspace(hypothesisId?: string, root?: string): Promise<{
    filesModified: string[];
    remaining: number;
    filesChecked: string[];
  }> {
    const base = this.resolveRoot(root);
    const filesChecked: string[] = [];
    const filesModified: string[] = [];
    let remaining = 0;

    const skipDirs = new Set(['node_modules', '.git', 'dist', 'out', '.agentk']);

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name));
          continue;
        }
        // Source-like files only
        if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|rb|php)$/.test(entry.name)) continue;
        const full = path.join(dir, entry.name);
        filesChecked.push(full);
        let content: string;
        try {
          content = fs.readFileSync(full, 'utf-8');
        } catch {
          continue;
        }
        if (!content.includes('DEBUG_INSTRUMENT')) continue;
        const cleaned = this.stripMarkers(content, hypothesisId);
        if (cleaned !== content) {
          fs.writeFileSync(full, cleaned, 'utf-8');
          filesModified.push(full);
        }
        remaining += this.countRemaining(cleaned, hypothesisId);
      }
    };

    walk(base);
    return { filesModified, remaining, filesChecked };
  }

  /**
   * Build cleanup report
   */
  buildCleanupReport(hypothesisId: string, filesChecked: string[], results: Array<{ file: string; remaining: number }>): string {
    const totalRemaining = results.reduce((sum, r) => sum + r.remaining, 0);
    return [
      '## 🧹 Instrumentation Cleanup',
      '',
      `**Hypothesis**: ${hypothesisId}`,
      `**Files checked**: ${filesChecked.length}`,
      `**Remaining markers**: ${totalRemaining}`,
      '',
      ...results.map(r => `- ${r.file}: ${r.remaining === 0 ? '✅ Clean' : `⚠️ ${r.remaining} marker(s) remaining`}`),
      '',
      totalRemaining === 0 ? '✅ All instrumentation markers removed.' : '⚠️ Some markers remain. Review before finalizing.'
    ].join('\n');
  }
}
