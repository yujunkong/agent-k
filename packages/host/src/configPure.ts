/**
 * HOST-004 — Pure project-config JSON helpers (no vscode).
 * Used by configBridge / configProject and unit tests.
 */

/** Flatten nested JSON into `agent-k.*` keys. */
export function flattenProjectConfig(
  obj: Record<string, unknown>,
  prefix = 'agent-k',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenProjectConfig(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Unflatten `agent-k.provider.model` → nested object for editor display. */
export function unflattenProjectConfig(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [fullKey, value] of Object.entries(flat)) {
    const parts = fullKey.replace(/^agent-k\./, '').split('.');
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      if (!cursor[p] || typeof cursor[p] !== 'object') cursor[p] = {};
      cursor = cursor[p] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;
  }
  return root;
}

export function pickProjectConfigValues(
  all: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('agent-k.')) out[k] = v;
  }
  return out;
}

/** Parse project JSON into flat `agent-k.*` values. */
export function parseProjectConfigJson(
  text: string,
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Project config must be a JSON object' };
    }
    return { ok: true, values: flattenProjectConfig(parsed as Record<string, unknown>) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function exampleProjectConfig(): string {
  return `${JSON.stringify(
    {
      provider: {
        type: 'litellm',
        baseUrl: '',
        model: '',
      },
      permission: {
        level: 'accept_edits',
      },
    },
    null,
    2,
  )}\n`;
}
