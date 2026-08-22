/**
 * MentionExtractor - @file: @folder: @symbol: @codebase: 파싱 (C1-T15)
 * Supports line ranges: @file:path:10-30 or @file:path#L10-L30
 */
export interface Mention {
  type: 'file' | 'folder' | 'symbol' | 'codebase';
  query: string;
  startPos: number;
  endPos: number;
  startLine?: number;
  endLine?: number;
}

const MENTION_RE = /@(file|folder|symbol|codebase):([^\s,;\]]+)/g;

/** Split path + optional :start-end / #Lstart-Lend from mention query */
export function parseFileMentionQuery(query: string): {
  path: string;
  startLine?: number;
  endLine?: number;
} {
  const hash = query.match(/^(.*)#L(\d+)(?:-L(\d+))?$/i);
  if (hash) {
    const startLine = Number(hash[2]);
    const endLine = hash[3] != null ? Number(hash[3]) : startLine;
    return { path: hash[1], startLine, endLine };
  }
  // path:10-30 — require digits after last colon so Windows C:\... still works when no range
  const range = query.match(/^(.*):(\d+)-(\d+)$/);
  if (range) {
    return {
      path: range[1],
      startLine: Number(range[2]),
      endLine: Number(range[3])
    };
  }
  const single = query.match(/^(.*):(\d+)$/);
  if (single && !/^[A-Za-z]$/.test(single[1].slice(-1))) {
    // Avoid treating "C:" drive as line — path before colon should look like a file
    if (/[\\/]|\.\w+$/.test(single[1])) {
      const startLine = Number(single[2]);
      return { path: single[1], startLine, endLine: startLine };
    }
  }
  return { path: query };
}

export function extractMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_RE.exec(text)) !== null) {
    const type = match[1] as Mention['type'];
    const query = match[2].trim();
    const base: Mention = {
      type,
      query,
      startPos: match.index,
      endPos: match.index + match[0].length
    };
    if (type === 'file') {
      const parsed = parseFileMentionQuery(query);
      base.query = parsed.path;
      base.startLine = parsed.startLine;
      base.endLine = parsed.endLine;
    }
    mentions.push(base);
  }

  return mentions;
}

export function extractFileMentions(text: string): string[] {
  return extractMentions(text)
    .filter((m) => m.type === 'file')
    .map((m) => {
      if (m.startLine != null && m.endLine != null && m.endLine !== m.startLine) {
        return `${m.query}:${m.startLine}-${m.endLine}`;
      }
      if (m.startLine != null) {
        return `${m.query}:${m.startLine}`;
      }
      return m.query;
    });
}

export function extractSymbolMentions(text: string): string[] {
  return extractMentions(text)
    .filter((m) => m.type === 'symbol')
    .map((m) => m.query);
}

export function hasCodebaseMention(text: string): boolean {
  return extractMentions(text).some((m) => m.type === 'codebase');
}
