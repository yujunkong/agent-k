/**
 * ADDON-T12: LSP cursor-depth context (hover / definition / references)
 *
 * Collects language-server context at the active cursor position so the
 * agent loop doesn't have to spend a turn calling lsp_definition/lsp_references
 * manually for the symbol it's already looking at. Every collector races
 * against a timeout so a slow or absent language server never blocks turn
 * start — this function never throws, and degrades to '' on any failure.
 */
export interface LspCursorContextDeps {
  /** Per-collector timeout in ms (default 2000) */
  timeoutMs?: number;
  getHover?: () => Promise<string>;
  getDefinitions?: () => Promise<string>;
  getReferences?: () => Promise<string>;
}

const DEFAULT_TIMEOUT_MS = 2000;

function safeTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...(truncated)';
}

/** Race a collector against a timeout — resolves '' instead of rejecting. */
async function withTimeout(promise: Promise<string>, ms: number): Promise<string> {
  return Promise.race([
    promise.catch(() => ''),
    new Promise<string>((resolve) => setTimeout(() => resolve(''), ms))
  ]);
}

interface VscodeLocationLike {
  uri: { fsPath: string };
  range: { start: { line: number } };
}

async function defaultGetHover(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const hovers = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      editor.document.uri,
      editor.selection.active
    )) as Array<{ contents: Array<string | { value?: string }> }> | undefined;
    if (!hovers?.length) return '';
    const parts: string[] = [];
    for (const h of hovers.slice(0, 3)) {
      for (const c of h.contents) {
        if (typeof c === 'string') parts.push(c);
        else if (c && typeof c.value === 'string') parts.push(c.value);
      }
    }
    return parts.join('\n');
  } catch {
    return '';
  }
}

async function defaultGetDefinitions(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const defs = (await vscode.commands.executeCommand(
      'vscode.executeDefinitionProvider',
      editor.document.uri,
      editor.selection.active
    )) as VscodeLocationLike[] | undefined;
    if (!defs?.length) return '';
    return defs.slice(0, 10).map((d) => `${d.uri.fsPath}:${d.range.start.line + 1}`).join('\n');
  } catch {
    return '';
  }
}

async function defaultGetReferences(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const refs = (await vscode.commands.executeCommand(
      'vscode.executeReferenceProvider',
      editor.document.uri,
      editor.selection.active
    )) as VscodeLocationLike[] | undefined;
    if (!refs?.length) return '';
    return refs.slice(0, 15).map((r) => `${r.uri.fsPath}:${r.range.start.line + 1}`).join('\n');
  } catch {
    return '';
  }
}

/**
 * Collect hover/definition/reference context at the active cursor and format
 * it as a `## LSP CURSOR CONTEXT` block with truncated sections.
 * Never throws — returns '' if nothing is available or everything fails.
 */
export async function collectLspCursorContext(deps?: LspCursorContextDeps): Promise<string> {
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const [hover, definitions, references] = await Promise.all([
      withTimeout((deps?.getHover ?? defaultGetHover)(), timeoutMs),
      withTimeout((deps?.getDefinitions ?? defaultGetDefinitions)(), timeoutMs),
      withTimeout((deps?.getReferences ?? defaultGetReferences)(), timeoutMs)
    ]);

    const sections: string[] = [];
    if (hover?.trim()) sections.push(`### Hover\n${safeTruncate(hover.trim(), 1500)}`);
    if (definitions?.trim()) sections.push(`### Definitions\n${safeTruncate(definitions.trim(), 1000)}`);
    if (references?.trim()) sections.push(`### References\n${safeTruncate(references.trim(), 1500)}`);

    if (!sections.length) return '';
    return ['## LSP CURSOR CONTEXT', '', ...sections].join('\n');
  } catch {
    return '';
  }
}
