/**
 * Fix common LLM Mermaid issues that break the parser.
 * Kept free of React/mermaid so unit tests can import it cleanly.
 */

function quoteLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return '""';
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t;
  }
  return `"${t.replace(/"/g, "'")}"`;
}

function needsQuotes(label: string): boolean {
  const t = label.trim();
  if (!t) return false;
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return false;
  }
  // Parens / slash / comma / colon / pipe / HTML breaks confuse the lexer
  return /[\(\)\/\|,:]|<br\s*\/?>/i.test(t);
}

/**
 * - Node labels with parentheses / slashes: A[Client (Web)] → A["Client (Web)"]
 * - Edge labels with spaces/slashes: -->|HTTP / WS| → -->|"HTTP / WS"|
 * - Preserve cylinder DB shapes: Id[(Label)] (do not turn into Id["(Label)"])
 */
export function sanitizeMermaid(definition: string): string {
  let s = definition.replace(/\r\n/g, '\n').trim();
  if (!s) return s;

  // Strip accidental ```mermaid fences if nested
  s = s.replace(/^```mermaid\s*/i, '').replace(/```\s*$/i, '').trim();

  // Edge labels: -->|HTTP / WS| or ---|foo bar|---
  s = s.replace(
    /(-->|---|==>|-\.-+|==)\s*\|([^|"\n]+)\|/g,
    (_m, arrow: string, label: string) => {
      const t = label.trim();
      if (!t || (t.startsWith('"') && t.endsWith('"'))) {
        return `${arrow}|${t}|`;
      }
      return `${arrow}|${quoteLabel(t)}|`;
    }
  );

  // Cylinder DB FIRST: Id[(Label)] — must run before generic Id[...]
  // Greedy inner match so nested parens in label still work: DB[(SQLite (WAL))]
  s = s.replace(
    /\b([A-Za-z][\w]*)\s*\[\(\s*([^\]\n]*)\s*\)\]/g,
    (_m, id: string, label: string) => {
      const t = label.trim();
      if (!t) return `${id}[()]`;
      if (
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
      ) {
        return `${id}[(${t})]`;
      }
      if (needsQuotes(t)) {
        return `${id}[(${quoteLabel(t)})]`;
      }
      return `${id}[(${t})]`;
    }
  );

  // Rect nodes: Id[Label] — skip cylinders via (?!\()
  s = s.replace(
    /\b([A-Za-z][\w]*)\s*\[(?!\()([^\]\n]+)\]/g,
    (_m, id: string, label: string) => {
      const t = label.trim();
      if (!t || (t.startsWith('"') && t.endsWith('"'))) {
        return `${id}[${t}]`;
      }
      if (!needsQuotes(t)) {
        return `${id}[${t}]`;
      }
      return `${id}[${quoteLabel(t)}]`;
    }
  );

  // Note: do not rewrite Id(Label) stadium nodes — too easy to corrupt
  // quoted labels / subgraph titles. Prefer [] with quotes for LLM output.

  return s;
}

/** Aggressive quote pass for retry — still preserves cylinders */
export function aggressiveQuoteMermaid(definition: string): string {
  return definition.replace(
    /\b([A-Za-z][\w]*)\s*\[(?!\()([^\]\n]+)\]/g,
    (_m, id: string, label: string) => {
      const t = label.trim().replace(/^"|"$/g, '');
      return `${id}[${quoteLabel(t)}]`;
    }
  );
}
