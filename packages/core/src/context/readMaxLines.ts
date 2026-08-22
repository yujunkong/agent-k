/**
 * CTX-002 — Read max lines constant / helper.
 * Caps a single read_file tool result so context stays bounded.
 */

/** Product default — mirrors ConfigManager `agent-k.context.readMaxLines`. */
export const DEFAULT_READ_MAX_LINES = 5000;

/** Clamp a configured max-lines value to a safe positive integer. */
export function resolveReadMaxLines(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_READ_MAX_LINES;
  return Math.min(Math.floor(n), 100_000);
}

/**
 * Truncate multiline text to at most `maxLines` lines.
 * Returns original string when under the limit.
 */
export function truncateToMaxLines(
  text: string,
  maxLines: number = DEFAULT_READ_MAX_LINES
): { text: string; truncated: boolean; lineCount: number } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return { text, truncated: false, lineCount: lines.length };
  }
  const kept = lines.slice(0, maxLines);
  return {
    text: `${kept.join('\n')}\n...(${lines.length - maxLines} more lines truncated)`,
    truncated: true,
    lineCount: lines.length,
  };
}
