/**
 * CFG-006 — Terminal configuration helpers.
 */

export const TERMINAL_CONFIG_KEYS = [
  'agent-k.terminal.timeoutMs',
  'agent-k.terminal.denyPatterns',
] as const;

export interface TerminalConfig {
  timeoutMs: number;
  denyPatterns: string[];
}

export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  timeoutMs: 60_000,
  denyPatterns: [],
};

export function extractTerminalConfig(
  bag: Record<string, unknown>
): TerminalConfig {
  const timeout = Number(bag['agent-k.terminal.timeoutMs']);
  const raw = bag['agent-k.terminal.denyPatterns'];
  const denyPatterns = Array.isArray(raw)
    ? raw.map((p) => String(p)).filter(Boolean)
    : [];
  return {
    timeoutMs: Number.isFinite(timeout) && timeout > 0
      ? Math.floor(timeout)
      : DEFAULT_TERMINAL_CONFIG.timeoutMs,
    denyPatterns,
  };
}

/** Simple substring/regex deny check for terminal commands. */
export function isTerminalCommandDenied(
  command: string,
  denyPatterns: readonly string[]
): boolean {
  const cmd = command || '';
  for (const pattern of denyPatterns) {
    if (!pattern) continue;
    try {
      if (new RegExp(pattern, 'i').test(cmd)) return true;
    } catch {
      if (cmd.toLowerCase().includes(pattern.toLowerCase())) return true;
    }
  }
  return false;
}
