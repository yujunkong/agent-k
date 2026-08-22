/**
 * Composer @ / detection helpers (no React).
 */

export type PaletteKind = 'mention' | 'slash';

export type MentionHit = {
  kind: 'file' | 'folder';
  path: string;
  label: string;
  description?: string;
};

export type SlashCommand = {
  id: string;
  label: string;
  description: string;
  /** What ChatApp should do */
  action:
    | 'newChat'
    | 'settings'
    | 'mode'
    | 'compact'
    | 'cost'
    | 'model'
    | 'permissions'
    | 'help'
    | 'bestOfN';
  mode?: 'ask' | 'agent' | 'plan' | 'debug';
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'new',
    label: '/new',
    description: 'New chat tab',
    action: 'newChat'
  },
  {
    id: 'agent',
    label: '/agent',
    description: 'Switch to Agent mode',
    action: 'mode',
    mode: 'agent'
  },
  {
    id: 'ask',
    label: '/ask',
    description: 'Switch to Ask mode',
    action: 'mode',
    mode: 'ask'
  },
  {
    id: 'plan',
    label: '/plan',
    description: 'Switch to Plan mode',
    action: 'mode',
    mode: 'plan'
  },
  {
    id: 'debug',
    label: '/debug',
    description: 'Switch to Debug mode',
    action: 'mode',
    mode: 'debug'
  },
  {
    id: 'settings',
    label: '/settings',
    description: 'Open settings',
    action: 'settings'
  },
  {
    id: 'compact',
    label: '/compact',
    description: 'Summarize older context (compaction)',
    action: 'compact'
  },
  {
    id: 'cost',
    label: '/cost',
    description: 'Show token/cost for this session',
    action: 'cost'
  },
  {
    id: 'model',
    label: '/model',
    description: 'Open model settings',
    action: 'model'
  },
  {
    id: 'permissions',
    label: '/permissions',
    description: 'Open permission settings',
    action: 'permissions'
  },
  {
    id: 'help',
    label: '/help',
    description: 'List available commands',
    action: 'help'
  },
  {
    id: 'bon',
    label: '/bon',
    description: 'Best-of-N: run in N worktrees, then compare',
    action: 'bestOfN'
  }
];

/**
 * ADDON-T10: resolve a raw `/foo` (or `/foo args`) token typed+submitted
 * outright (not via palette selection) into a known SlashCommand, or a
 * friendly error for unknown commands.
 */
export function resolveSlashCommand(
  raw: string
): { ok: true; cmd: SlashCommand } | { ok: false; error: string } {
  const trimmed = String(raw || '').trim();
  if (!trimmed.startsWith('/')) {
    return { ok: false, error: 'Not a slash command (must start with "/").' };
  }
  const id = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() || '';
  if (!id) {
    return { ok: false, error: 'Empty command. Type /help to see available commands.' };
  }
  const cmd = SLASH_COMMANDS.find((c) => c.id === id);
  if (!cmd) {
    return {
      ok: false,
      error: `Unknown command "/${id}". Type /help to see available commands.`
    };
  }
  return { ok: true, cmd };
}

export type ActiveTrigger =
  | {
      kind: 'mention';
      /** Index of `@` in text */
      start: number;
      /** Query after `@` */
      query: string;
    }
  | {
      kind: 'slash';
      start: number;
      query: string;
    };

/**
 * Detect @file mention or leading /command at cursor.
 * `@` works mid-text; `/` only at line start (or whole-input command).
 */
export function detectComposerTrigger(
  text: string,
  cursor: number
): ActiveTrigger | null {
  const pos = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, pos);

  // Slash: start of input or after newline, no spaces in the token yet except query
  const slashMatch = before.match(/(?:^|\n)\/([^\s]*)$/);
  if (slashMatch) {
    const token = slashMatch[0].replace(/^\n/, '');
    const start = pos - token.length;
    return {
      kind: 'slash',
      start,
      query: slashMatch[1] || ''
    };
  }

  // Mention: @query without whitespace (Cursor-like file search)
  const atMatch = before.match(/@([^\s]*)$/);
  if (atMatch) {
    // Don't treat email-like mid-word (@ in the middle of a token after alphanumeric)
    const atIndex = pos - atMatch[0].length;
    if (atIndex > 0) {
      const prev = text[atIndex - 1];
      if (prev && /[A-Za-z0-9._-]/.test(prev)) return null;
    }
    return {
      kind: 'mention',
      start: atIndex,
      query: atMatch[1] || ''
    };
  }

  return null;
}

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().replace(/^\//, '');
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) =>
      c.id.includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
  );
}

/** Replace trigger span with empty (chip carries the context) */
export function replaceTriggerRange(
  text: string,
  start: number,
  cursor: number,
  insert = ''
): { text: string; cursor: number } {
  const next = text.slice(0, start) + insert + text.slice(cursor);
  const nextCursor = start + insert.length;
  return { text: next, cursor: nextCursor };
}

/** Normalize to posix-ish relative path */
export function normalizeRelPath(p: string): string {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

/** Parent directory of a relative file path (or folder path itself) */
export function parentRelPath(relOrDesc: string, kind: 'file' | 'folder'): string {
  const rel = normalizeRelPath(relOrDesc);
  if (!rel) return '';
  if (kind === 'folder') {
    const parts = rel.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  }
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(0, i) : '';
}

/**
 * Cursor-style path hint beside the filename — keep last 1–2 segments,
 * ellipsis the front when long.
 */
export function abbreviatePathHint(parentPath: string, maxLen = 28): string {
  const p = normalizeRelPath(parentPath);
  if (!p) return '';
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  if (parts.length <= 1) return `…${p.slice(-(maxLen - 1))}`;
  // Prefer last two segments: …/chat/components
  const tail =
    parts.length >= 2
      ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
      : parts[parts.length - 1];
  if (tail.length + 1 <= maxLen) return `…/${tail}`;
  return `…/${parts[parts.length - 1]}`;
}

/** Segments for tree preview (folders + leaf name) */
export function pathPreviewSegments(
  relPath: string,
  kind: 'file' | 'folder',
  leafLabel: string
): Array<{ name: string; kind: 'folder' | 'file' }> {
  const rel = normalizeRelPath(relPath);
  const parts = rel ? rel.split('/').filter(Boolean) : [];
  if (kind === 'folder') {
    return parts.map((name) => ({ name, kind: 'folder' as const }));
  }
  // description may be full rel including file — drop duplicate leaf
  const dirs =
    parts.length && parts[parts.length - 1] === leafLabel
      ? parts.slice(0, -1)
      : parentRelPath(rel, 'file')
        ? parentRelPath(rel, 'file').split('/')
        : parts.slice(0, -1);
  return [
    ...dirs.filter(Boolean).map((name) => ({ name, kind: 'folder' as const })),
    { name: leafLabel || parts[parts.length - 1] || 'file', kind: 'file' as const }
  ];
}
