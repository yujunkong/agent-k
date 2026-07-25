/**
 * MentionExtractor - @file: @folder: @symbol: @codebase: 파싱 (C1-T15)
 */
export interface Mention {
  type: 'file' | 'folder' | 'symbol' | 'codebase';
  query: string;
  startPos: number;
  endPos: number;
}

const MENTION_RE = /@(file|folder|symbol|codebase):([^\s,;\]]+)/g;

export function extractMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  let match: RegExpExecArray | null;

  while ((match = MENTION_RE.exec(text)) !== null) {
    mentions.push({
      type: match[1] as Mention['type'],
      query: match[2].trim(),
      startPos: match.index,
      endPos: match.index + match[0].length
    });
  }

  return mentions;
}

export function extractFileMentions(text: string): string[] {
  return extractMentions(text)
    .filter(m => m.type === 'file')
    .map(m => m.query);
}

export function extractSymbolMentions(text: string): string[] {
  return extractMentions(text)
    .filter(m => m.type === 'symbol')
    .map(m => m.query);
}

export function hasCodebaseMention(text: string): boolean {
  return extractMentions(text).some(m => m.type === 'codebase');
}
