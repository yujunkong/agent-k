/**
 * WT-008 — git status --porcelain parsing (tracked/untracked rows).
 */
export type PorcelainEntry = {
  /** Two-char XY status (or '??' / '!!'). */
  code: string;
  path: string;
  /** Rename/copy target when present. */
  renameTo?: string;
};

/**
 * Parse `git status --porcelain` / `-z` style line output (newline-separated).
 * Paths may include ` -> ` for renames.
 */
export function parseStatusPorcelain(output: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  for (const raw of output.split(/\r?\n/)) {
    if (!raw || raw.length < 4) continue;
    const code = raw.slice(0, 2);
    const rest = raw.slice(3).trim();
    if (!rest) continue;
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) {
      entries.push({
        code,
        path: rest.slice(0, arrow).trim(),
        renameTo: rest.slice(arrow + 4).trim(),
      });
    } else {
      entries.push({ code, path: rest });
    }
  }
  return entries;
}

export function porcelainPaths(output: string): string[] {
  return parseStatusPorcelain(output).map((e) => e.renameTo || e.path);
}
