import { describe, it, expect } from 'vitest';
import {
  detectComposerTrigger,
  filterSlashCommands,
  replaceTriggerRange
} from '../src/chat/composerPalette';

describe('composerPalette', () => {
  it('detects @ mention query', () => {
    const text = 'see @Mess';
    const t = detectComposerTrigger(text, text.length);
    expect(t).toEqual({ kind: 'mention', start: 4, query: 'Mess' });
  });

  it('ignores email-like @', () => {
    expect(detectComposerTrigger('a@b', 3)).toBeNull();
  });

  it('detects leading slash command', () => {
    const t = detectComposerTrigger('/ag', 3);
    expect(t).toEqual({ kind: 'slash', start: 0, query: 'ag' });
  });

  it('filters slash commands', () => {
    const hits = filterSlashCommands('pla');
    expect(hits.some((c) => c.id === 'plan')).toBe(true);
  });

  it('replaces trigger range', () => {
    const r = replaceTriggerRange('hi @foo bar', 3, 7, '');
    expect(r.text).toBe('hi  bar');
    expect(r.cursor).toBe(3);
  });
});
