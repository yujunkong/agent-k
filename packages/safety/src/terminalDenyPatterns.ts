/**
 * SAFE-003 — Terminal deny patterns.
 * Hard-block catastrophic / destructive shell commands.
 */

/** Substrings / literals that must never run via terminal tools. */
export const DEFAULT_TERMINAL_DENY_PATTERNS: readonly string[] = [
  'rm -rf /',
  'mkfs',
  'dd if=',
  ':(){ :|:& };:', // classic fork bomb
] as const;

export interface TerminalDenyMatch {
  denied: true;
  /** Which pattern matched (for R-005 error details; not the full command). */
  pattern: string;
}

/**
 * Returns true when the command contains a hard-denied pattern.
 * Matching is substring-based on a trimmed command string.
 */
export function isTerminalCommandDenied(command: string): boolean {
  return matchTerminalDenyPattern(command) !== null;
}

/**
 * Detail-aware match for gate / hook error contracts.
 */
export function matchTerminalDenyPattern(
  command: string,
): TerminalDenyMatch | null {
  const trimmed = command.trim();
  for (const pattern of DEFAULT_TERMINAL_DENY_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return { denied: true, pattern };
    }
  }
  return null;
}
