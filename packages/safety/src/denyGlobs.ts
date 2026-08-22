/**
 * SAFE-002 — Deny globs matcher.
 * Blocks sensitive paths (.env, secrets, keys, .git, node_modules).
 */

/** Default deny patterns (CFG-003 / SAFE-002 product defaults). */
export const DEFAULT_DENY_GLOBS: readonly string[] = [
  '**/.env*',
  '**/secrets/**',
  '**/id_rsa*',
  '**/*.pem',
  '**/.git/**',
  '**/node_modules/**',
] as const;

/**
 * Minimal glob → RegExp for deny paths.
 * Double-star matches across separators; single-star matches one segment.
 */
export function matchGlobPattern(path: string, pattern: string): boolean {
  let i = 0;
  let out = '^';
  const regexMeta = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
      continue;
    }
    if (ch === '*') {
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if (regexMeta.has(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += '$';
  return new RegExp(out).test(path);
}

/**
 * Returns true when `path` matches any deny glob.
 * Paths are normalized to forward slashes before matching.
 */
export function isPathDenied(
  path: string,
  denyGlobs: readonly string[] = DEFAULT_DENY_GLOBS,
): boolean {
  const normalized = path.replace(/\\/g, '/');
  return denyGlobs.some((pattern) => matchGlobPattern(normalized, pattern));
}
