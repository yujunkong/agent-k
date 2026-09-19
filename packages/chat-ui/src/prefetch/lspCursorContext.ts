/**
 * ADDON-T12: LSP cursor-depth context (hover / definition / references).
 * B-2: the webview cannot touch vscode — collectors are injected by the host.
 * Without injected deps the block degrades to '' (never throws).
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

/** Host-owned default — webview returns '' (no vscode). */
async function defaultGetHover(): Promise<string> {
  return '';
}

async function defaultGetDefinitions(): Promise<string> {
  return '';
}

async function defaultGetReferences(): Promise<string> {
  return '';
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
