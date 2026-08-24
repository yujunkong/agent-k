/**
 * CTX-011 — lspCursorContext ported from v2.1 `src/prefetch/lspCursorContext.ts`.
 * ADDON-T12: hover / definition / references at cursor with per-collector timeout.
 *
 * v2.1 defaulted to `require('vscode')` when deps omitted. Core stays vscode-free:
 * omit collectors → empty string; host injects LSP providers via LspCursorContextDeps.
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
    new Promise<string>((resolve) => setTimeout(() => resolve(''), ms)),
  ]);
}

async function emptyCollector(): Promise<string> {
  return '';
}

/**
 * Collect hover/definition/reference context and format as
 * `## LSP CURSOR CONTEXT`. Never throws — returns '' if nothing available.
 */
export async function collectLspCursorContext(deps?: LspCursorContextDeps): Promise<string> {
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const [hover, definitions, references] = await Promise.all([
      withTimeout((deps?.getHover ?? emptyCollector)(), timeoutMs),
      withTimeout((deps?.getDefinitions ?? emptyCollector)(), timeoutMs),
      withTimeout((deps?.getReferences ?? emptyCollector)(), timeoutMs),
    ]);

    const sections: string[] = [];
    if (hover?.trim()) sections.push(`### Hover\n${safeTruncate(hover.trim(), 1500)}`);
    if (definitions?.trim()) {
      sections.push(`### Definitions\n${safeTruncate(definitions.trim(), 1000)}`);
    }
    if (references?.trim()) {
      sections.push(`### References\n${safeTruncate(references.trim(), 1500)}`);
    }

    if (!sections.length) return '';
    return ['## LSP CURSOR CONTEXT', '', ...sections].join('\n');
  } catch {
    return '';
  }
}
