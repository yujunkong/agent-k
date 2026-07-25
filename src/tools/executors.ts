/**
 * 도구 실행기 구현 (Read Tools)
 * 
 * 각 도구의 실제 실행 로직. 
 * extension host에서 실행됨 (Node.js 환경).
 */
import type { ToolInput, ToolOutput } from './types';
import { recordFileReadForStaleness } from './writeExecutors';

export async function executeGrep(input: ToolInput): Promise<ToolOutput> {
  const { pattern, include, path, maxResults = 50 } = input;
  try {
    // Use ripgrep via child_process
    const { execSync } = require('child_process');
    const args = ['rg', '-n', '--no-heading', '--color', 'never'];
    if (include) args.push('-g', include);
    args.push(pattern);
    if (path) args.push(path);
    
    const result = execSync(args.join(' '), { 
      encoding: 'utf-8', 
      maxBuffer: 1024 * 1024,
      timeout: 30000
    });
    
    const lines = result.split('\n').filter(Boolean).slice(0, maxResults);
    const truncated = result.split('\n').filter(Boolean).length > maxResults;
    
    return {
      success: true,
      data: { results: lines, count: lines.length, truncated },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    // rg returns exit code 1 when no matches found
    if (error.status === 1) {
      return { success: true, data: { results: [], count: 0 }, metadata: { duration: 0 } };
    }
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}

export async function executeGlob(input: ToolInput): Promise<ToolOutput> {
  const { pattern, path: rootPath, maxResults = 100 } = input;
  try {
    const { getWorkspaceRoot } = await import('./writeExecutors');
    const cwd = (rootPath as string) || getWorkspaceRoot() || process.cwd();
    const files = await matchGlobFiles(String(pattern || '**/*'), cwd, maxResults as number);
    return {
      success: true,
      data: { files, count: files.length },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}

/**
 * Minimal glob without fast-glob dependency (not in package.json).
 * Supports **, *, ?, and simple brace-free patterns. Skips node_modules/.git/dist.
 */
async function matchGlobFiles(
  pattern: string,
  cwd: string,
  maxResults: number
): Promise<string[]> {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  // Prefer VS Code findFiles when available (Extension Host)
  try {
    const vscode = require('vscode') as typeof import('vscode');
    if (vscode?.workspace?.findFiles) {
      const folder =
        vscode.workspace.workspaceFolders?.find((f) =>
          cwd.startsWith(f.uri.fsPath)
        ) || vscode.workspace.workspaceFolders?.[0];
      if (folder) {
        const rel = path.relative(folder.uri.fsPath, cwd);
        const include =
          !rel || rel === ''
            ? pattern
            : new vscode.RelativePattern(cwd, pattern);
        const uris = await vscode.workspace.findFiles(
          include,
          '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}',
          maxResults
        );
        return uris.map((u) => u.fsPath);
      }
    }
  } catch {
    /* unit tests / no vscode */
  }

  const ignoreDir = new Set(['node_modules', '.git', 'dist', 'out', '.cursor']);
  const results: string[] = [];
  // Convert glob to regex (rough)
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '<<<DD>>>')
    .replace(/\*\*/g, '<<<DS>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<<DD>>>/g, '(?:.*/)?')
    .replace(/<<<DS>>>/g, '.*');
  const re = new RegExp('^' + escaped + '$');

  const walk = (dir: string) => {
    if (results.length >= maxResults) return;
    let entries: import('fs').Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (results.length >= maxResults) return;
      if (ent.name.startsWith('.') && ent.name !== '.') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ignoreDir.has(ent.name)) continue;
        walk(full);
      } else if (ent.isFile()) {
        const rel = path.relative(cwd, full).split(path.sep).join('/');
        if (re.test(rel) || re.test(ent.name)) {
          results.push(full);
        }
      }
    }
  };
  walk(cwd);
  return results;
}

export async function executeReadFile(input: ToolInput): Promise<ToolOutput> {
  const { path: filePath, offset, maxChars = 50000 } = input;
  // Cursor-like: default window ~250 lines (ContextRules) — never dump whole files by accident
  const { TIER_A_CONTEXT_RULES } = await import('../harness/ContextRules');
  const defaultLines = TIER_A_CONTEXT_RULES.defaultReadLines;
  const requestedLimit =
    input.limit != null && Number(input.limit) > 0
      ? Number(input.limit)
      : undefined;

  try {
    const fs = require('fs');
    const { resolveWorkspacePath } = await import('./writeExecutors');
    let abs = filePath as string;
    if (abs) {
      const resolved = resolveWorkspacePath(abs);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, metadata: { duration: 0 } };
      }
      abs = resolved.abs;
    }
    const content = fs.readFileSync(abs, 'utf-8');
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    const startLine = Math.max(1, Number(offset) || 1);
    // Tiny files: allow full read; otherwise enforce default window when limit omitted
    const effectiveLimit =
      requestedLimit != null
        ? Math.min(requestedLimit, 2000)
        : totalLines <= defaultLines
          ? totalLines
          : defaultLines;

    const slice = allLines.slice(startLine - 1, startLine - 1 + effectiveLimit);
    let result = slice.join('\n');
    const charTruncated = result.length > (maxChars as number);
    if (charTruncated) {
      result = result.slice(0, maxChars as number) + '\n...(truncated)';
    }

    const endLine = startLine + slice.length - 1;
    const moreAvailable = endLine < totalLines;
    recordFileReadForStaleness(abs as string);

    return {
      success: true,
      data: {
        content: result,
        path: abs,
        totalLines,
        startLine,
        endLine,
        truncated: charTruncated || moreAvailable,
        // Tell the model how to continue like Cursor (offset/limit windows)
        ...(moreAvailable
          ? {
              note: `Showing lines ${startLine}-${endLine} of ${totalLines}. Read more with offset=${endLine + 1} and limit=${defaultLines}. Prefer grep/codebase_search first; do not re-read the whole file.`
            }
          : {})
      },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    return { success: false, error: `Cannot read file: ${error.message}`, metadata: { duration: 0 } };
  }
}

export async function executeListDir(input: ToolInput): Promise<ToolOutput> {
  const { path: dirPath, depth = 1 } = input;
  try {
    const fs = require('fs');
    const path = require('path');
    
    function list(dir: string, currentDepth: number): any[] {
      if (currentDepth > depth) return [];
      const entries: any[] = fs.readdirSync(dir, { withFileTypes: true });
      return entries.map((entry: any) => {
        const fullPath = path.join(dir, entry.name);
        const item: any = { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
        if (entry.isDirectory() && currentDepth < depth) {
          item.children = list(fullPath, currentDepth + 1);
        }
        return item;
      });
    }
    
    const items = list(dirPath, 1);
    return { success: true, data: { path: dirPath, items }, metadata: { duration: 0 } };
  } catch (error: any) {
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}

export async function executeCodebaseSearch(input: ToolInput): Promise<ToolOutput> {
  const query = String(input.query || '').trim();
  const maxResults = Math.min(Number(input.maxResults) || 10, 25);
  if (!query) {
    return { success: false, error: 'query is required', metadata: { duration: 0 } };
  }

  // 1) Warm chunk index if present (substring) — returns path + line ranges
  try {
    const indexed = await searchViaChunkIndex(query, maxResults);
    if (indexed.length > 0) {
      return {
        success: true,
        data: {
          query,
          method: 'index',
          results: indexed,
          count: indexed.length,
          note: 'Use read_file with offset/limit around startLine–endLine; do not read whole files.'
        },
        metadata: { duration: 0 }
      };
    }
  } catch {
    // fall through to grep
  }

  // 2) Grep-backed snippets (Cursor-like locate → windowed read)
  const viaGrep = await searchViaGrepSnippets(query, maxResults);
  return {
    success: true,
    data: {
      query,
      method: 'grep',
      results: viaGrep,
      count: viaGrep.length,
      note: 'Use read_file with offset/limit around startLine–endLine; do not read whole files.'
    },
    metadata: { duration: 0 }
  };
}

/** Lazy workspace chunk index for codebase_search */
let chunkIndexer: import('../indexing/CodebaseIndexer').CodebaseIndexer | null = null;
let chunkIndexRoot: string | null = null;

async function searchViaChunkIndex(
  query: string,
  maxResults: number
): Promise<
  Array<{
    path: string;
    startLine: number;
    endLine: number;
    snippet: string;
  }>
> {
  const path = require('path');
  const { getWorkspaceRoot } = await import('./writeExecutors');
  const { CodebaseIndexer } = await import('../indexing/CodebaseIndexer');
  const root = getWorkspaceRoot();
  if (!root) return [];

  if (!chunkIndexer || chunkIndexRoot !== root) {
    const indexDir = path.join(root, '.agent-k-index');
    chunkIndexer = new CodebaseIndexer(indexDir);
    chunkIndexer.loadIndex();
    chunkIndexRoot = root;
    // Warm in background so first query stays fast (grep fallback)
    if (chunkIndexer.getStats().totalChunks === 0) {
      const indexer = chunkIndexer;
      setImmediate(() => {
        try {
          indexer.indexDirectory(root);
        } catch {
          /* ignore index build errors */
        }
      });
    }
  }

  if (chunkIndexer.getStats().totalChunks === 0) return [];

  const hits = chunkIndexer.search(query, maxResults);
  return hits.map((c) => ({
    path: c.filePath,
    startLine: c.startLine,
    endLine: c.endLine,
    snippet: c.content.slice(0, 1200)
  }));
}

/** Grep hits → small windows with line numbers for read_file */
async function searchViaGrepSnippets(
  query: string,
  maxResults: number
): Promise<
  Array<{
    path: string;
    startLine: number;
    endLine: number;
    matchLine: number;
    snippet: string;
  }>
> {
  const fs = require('fs');
  // Prefer distinctive tokens from NL query for ripgrep
  const token =
    query
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/^(the|and|for|with|from|that|this|file|code|how|what)$/i.test(t))
      .slice(0, 4)
      .join('|') || query.slice(0, 80);

  const grepOut = await executeGrep({
    pattern: token.includes('|') ? token : token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    maxResults: maxResults * 3
  });
  if (!grepOut.success || !grepOut.data) return [];

  const lines = (grepOut.data as { results?: string[] }).results || [];
  const out: Array<{
    path: string;
    startLine: number;
    endLine: number;
    matchLine: number;
    snippet: string;
  }> = [];
  const seen = new Set<string>();

  for (const row of lines) {
    // path:line:content
    const m = row.match(/^(.*?):(\d+):(.*)$/);
    if (!m) continue;
    const filePath = m[1];
    const matchLine = Number(m[2]);
    const key = `${filePath}:${matchLine}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let snippet = m[3];
    let startLine = matchLine;
    let endLine = matchLine;
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const all = text.split('\n');
      startLine = Math.max(1, matchLine - 15);
      endLine = Math.min(all.length, matchLine + 15);
      snippet = all
        .slice(startLine - 1, endLine)
        .map((ln: string, i: number) => `${startLine + i}|${ln}`)
        .join('\n')
        .slice(0, 2000);
    } catch {
      /* keep single-line snippet */
    }

    out.push({ path: filePath, startLine, endLine, matchLine, snippet });
    if (out.length >= maxResults) break;
  }
  return out;
}

export async function executeLspDefinition(input: ToolInput): Promise<ToolOutput> {
  const { symbol, path } = input;
  return {
    success: true,
    data: {
      symbol,
      message: 'LSP definition lookup via VS Code API. Use vscode.commands.executeCommand("vscode.executeDefinitionProvider")',
      definitions: []
    },
    metadata: { duration: 0 }
  };
}

export async function executeLspReferences(input: ToolInput): Promise<ToolOutput> {
  const { symbol, path } = input;
  return {
    success: true,
    data: {
      symbol,
      message: 'LSP references lookup via VS Code API',
      references: []
    },
    metadata: { duration: 0 }
  };
}

/**
 * read_lints 실행기 (HARB-T06) — LintRunner.runLint 래핑
 */
export async function executeReadLints(input: ToolInput): Promise<ToolOutput> {
  const { paths } = input;
  const filePaths: string[] = Array.isArray(paths)
    ? (paths as string[]).filter(Boolean)
    : [];

  if (filePaths.length === 0) {
    return { success: false, error: 'read_lints requires paths: string[]', metadata: { duration: 0 } };
  }

  try {
    const { LintRunner } = await import('../verification/LintRunner');
    const runner = new LintRunner();
    const errors = await runner.runLint(filePaths);
    const formatted = runner.formatErrors(errors);
    return {
      success: true,
      data: {
        errors,
        count: errors.length,
        formatted: formatted || '(no diagnostics)'
      },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}
