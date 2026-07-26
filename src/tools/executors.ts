/**
 * 도구 실행기 구현 (Read Tools)
 * 
 * 각 도구의 실제 실행 로직. 
 * extension host에서 실행됨 (Node.js 환경).
 */
import type { ToolInput, ToolOutput } from './types';
import { recordFileReadForStaleness } from './writeExecutors';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, execSync } from 'child_process';

/** Resolve ripgrep binary — VS Code GUI PATH often lacks Homebrew. */
function findRipgrepBinary(): string | null {
  const candidates = [
    process.env.AGENT_K_RG_PATH,
    'rg',
    '/opt/homebrew/bin/rg',
    '/usr/local/bin/rg',
    '/usr/bin/rg'
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      if (bin === 'rg') {
        execFileSync(bin, ['--version'], {
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore'],
          env: {
            ...process.env,
            PATH: [
              process.env.PATH || '',
              '/opt/homebrew/bin',
              '/usr/local/bin',
              '/usr/bin',
              '/bin'
            ].join(path.delimiter)
          }
        });
        return bin;
      }
      if (fs.existsSync(bin)) {
        execFileSync(bin, ['--version'], {
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore']
        });
        return bin;
      }
    } catch {
      /* try next */
    }
  }

  // Last resort: `which rg` with augmented PATH
  try {
    const which = execSync('which rg', {
      encoding: 'utf-8',
      timeout: 3000,
      env: {
        ...process.env,
        PATH: [
          process.env.PATH || '',
          '/opt/homebrew/bin',
          '/usr/local/bin'
        ].join(path.delimiter)
      }
    })
      .trim()
      .split('\n')[0];
    if (which && fs.existsSync(which)) return which;
  } catch {
    /* no rg */
  }
  return null;
}

function grepJsFallback(
  pattern: string,
  cwd: string,
  include: string | undefined,
  maxResults: number
): string[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const ignoreDir = new Set(['node_modules', '.git', 'dist', 'out', '.cursor', '.harb']);
  const textExt = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|java|kt|swift|css|scss|html|yml|yaml|toml|sh|bash|zsh|txt|vue|svelte)$/i;
  const includeRe = include
    ? (() => {
        try {
          const escaped = String(include)
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          return new RegExp('^' + escaped + '$', 'i');
        } catch {
          return null;
        }
      })()
    : null;

  const hits: string[] = [];
  const walk = (dir: string) => {
    if (hits.length >= maxResults) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (hits.length >= maxResults) return;
      if (ent.name.startsWith('.') && ent.name !== '.') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ignoreDir.has(ent.name)) continue;
        walk(full);
      } else if (ent.isFile()) {
        if (!textExt.test(ent.name)) continue;
        if (includeRe && !includeRe.test(ent.name) && !includeRe.test(path.relative(cwd, full))) {
          continue;
        }
        let content: string;
        try {
          const st = fs.statSync(full);
          if (st.size > 1_500_000) continue;
          content = fs.readFileSync(full, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (hits.length >= maxResults) return;
          if (re.test(lines[i])) {
            hits.push(`${full}:${i + 1}:${lines[i]}`);
          }
        }
      }
    }
  };
  walk(cwd);
  return hits;
}

export async function executeGrep(input: ToolInput): Promise<ToolOutput> {
  const pattern = String(
    input.pattern || input.query || input.search || ''
  ).trim();
  const include = (input.include || input.glob || input.glob_pattern) as
    | string
    | undefined;
  const maxResults = Math.min(Number(input.maxResults) || 50, 200);
  if (!pattern) {
    return {
      success: false,
      error: 'grep requires pattern (or query)',
      metadata: { duration: 0 }
    };
  }

  const { getWorkspaceRoot, resolveWorkspacePath } = await import('./writeExecutors');
  let cwd = getWorkspaceRoot() || process.cwd();
  const rawPath = (input.path || input.cwd || input.target) as string | undefined;
  if (rawPath && String(rawPath).trim() && String(rawPath).trim() !== '.') {
    const resolved = resolveWorkspacePath(String(rawPath));
    if ('error' in resolved) {
      return { success: false, error: resolved.error, metadata: { duration: 0 } };
    }
    cwd = resolved.abs;
  }

  const t0 = Date.now();
  const rg = findRipgrepBinary();

  if (rg) {
    try {
      // NEVER join args into a shell string — `|` in patterns must stay literal
      const args = ['-n', '--no-heading', '--color', 'never', '--hidden', '-S'];
      if (include) {
        args.push('-g', String(include));
      }
      args.push('--', pattern, cwd);

      const result = execFileSync(rg, args, {
        encoding: 'utf-8',
        maxBuffer: 2 * 1024 * 1024,
        timeout: 30000,
        cwd,
        env: {
          ...process.env,
          PATH: [
            process.env.PATH || '',
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin'
          ].join(path.delimiter)
        }
      });

      const all = String(result).split('\n').filter(Boolean);
      const lines = all.slice(0, maxResults);
      return {
        success: true,
        data: {
          results: lines,
          count: lines.length,
          truncated: all.length > maxResults,
          engine: 'rg'
        },
        metadata: { duration: Date.now() - t0 }
      };
    } catch (error: any) {
      // rg exit 1 = no matches
      if (error.status === 1 || error.status === 0) {
        return {
          success: true,
          data: { results: [], count: 0, engine: 'rg' },
          metadata: { duration: Date.now() - t0 }
        };
      }
      // Fall through to JS on missing binary / other errors
      if (error.status !== 127 && !/ENOENT|not found/i.test(String(error.message || ''))) {
        // regex error etc. — still try JS fallback
      }
    }
  }

  try {
    const lines = grepJsFallback(pattern, cwd, include, maxResults);
    return {
      success: true,
      data: {
        results: lines,
        count: lines.length,
        truncated: false,
        engine: 'js',
        note: rg ? 'rg failed; used JS fallback' : 'rg not found; used JS fallback'
      },
      metadata: { duration: Date.now() - t0 }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'grep failed',
      metadata: { duration: Date.now() - t0 }
    };
  }
}

export async function executeFileSearch(input: ToolInput): Promise<ToolOutput> {
  const query = String(input.query || input.pattern || input.name || '').trim();
  if (!query) {
    return { success: false, error: 'file_search requires query', metadata: { duration: 0 } };
  }
  // Convert bare name → glob
  const pattern =
    query.includes('*') || query.includes('/') || query.includes('\\')
      ? query
      : `**/*${query}*`;
  return executeGlob({
    ...input,
    pattern,
    maxResults: input.maxResults || 50
  });
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

/** Batch read — up to 12 paths in parallel */
export async function executeReadFiles(input: ToolInput): Promise<ToolOutput> {
  const raw = input.paths;
  const paths = Array.isArray(raw)
    ? raw.map((p) => String(p || '').trim()).filter(Boolean)
    : typeof raw === 'string'
      ? [raw.trim()].filter(Boolean)
      : [];
  if (!paths.length) {
    return {
      success: false,
      error: 'read_files requires a non-empty paths array',
      metadata: { duration: 0 }
    };
  }
  const capped = paths.slice(0, 12);
  const shared = {
    offset: input.offset,
    limit: input.limit,
    maxChars: input.maxChars
  };
  const { mapPool } = await import('../loop/parallelRead');
  const results = await mapPool(capped, 8, async (path) => {
    const one = await executeReadFile({ ...shared, path });
    return {
      path,
      success: one.success,
      error: one.error,
      data: one.data
    };
  });
  const ok = results.filter((r) => r.success).length;
  return {
    success: ok > 0,
    data: {
      files: results,
      count: results.length,
      ok,
      failed: results.length - ok,
      ...(paths.length > 12
        ? { note: `Only first 12 of ${paths.length} paths were read. Call again for the rest.` }
        : {})
    },
    error: ok === 0 ? 'All read_files paths failed' : undefined,
    metadata: { duration: 0 }
  };
}

export async function executeListDir(input: ToolInput): Promise<ToolOutput> {
  const depth = Number(input.depth) || 1;
  try {
    const { getWorkspaceRoot, resolveWorkspacePath } = await import('./writeExecutors');
    let dir = String(input.path || input.dir || '.').trim() || '.';
    if (dir === '.') {
      dir = getWorkspaceRoot() || process.cwd();
    } else {
      const resolved = resolveWorkspacePath(dir);
      if ('error' in resolved) {
        return { success: false, error: resolved.error, metadata: { duration: 0 } };
      }
      dir = resolved.abs;
    }

    function list(dirPath: string, currentDepth: number): any[] {
      if (currentDepth > depth) return [];
      const entries: fs.Dirent[] = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries.map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const item: any = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file'
        };
        if (entry.isDirectory() && currentDepth < depth) {
          item.children = list(fullPath, currentDepth + 1);
        }
        return item;
      });
    }

    const entries = list(dir, 1);
    return {
      success: true,
      data: { path: dir, entries, count: entries.length },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Cannot list directory: ${error.message}`,
      metadata: { duration: 0 }
    };
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
