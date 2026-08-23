import { describe, expect, it } from 'vitest';
import {
  buildBeforeAfterDiff,
  buildEditDiffPreview,
  splitDiffLines,
} from './editDiffPreview';

describe('editDiffPreview', () => {
  it('drops trailing-newline empty segment', () => {
    expect(splitDiffLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitDiffLines('a\n\n')).toEqual(['a', '']);
  });

  it('before→after keeps shared lines as context (small edit)', () => {
    const before = ['A', 'B', 'OLD', 'C', 'D'].join('\n');
    const after = ['A', 'B', 'NEW', 'C', 'D'].join('\n');
    const preview = buildBeforeAfterDiff(before, after);
    expect(preview.additions).toBe(1);
    expect(preview.deletions).toBe(1);
    expect(preview.lines.find((l) => l.text === 'OLD')?.type).toBe('delete');
    expect(preview.lines.find((l) => l.text === 'NEW')?.type).toBe('add');
    expect(preview.lines.some((l) => l.type === 'context' && l.text === 'B')).toBe(
      true,
    );
  });

  it('large rewrite emits full lines (no … more placeholders)', () => {
    const before = Array.from({ length: 40 }, (_, i) => `old_${i}`).join('\n');
    const after = Array.from({ length: 50 }, (_, i) => `new_${i}`).join('\n');
    const preview = buildBeforeAfterDiff(before, after);
    expect(preview.deletions).toBe(40);
    expect(preview.additions).toBe(50);
    expect(preview.lines.some((l) => /more lines/.test(l.text))).toBe(false);
    expect(preview.lines.filter((l) => l.type === 'delete').length).toBe(40);
    expect(preview.lines.filter((l) => l.type === 'add').length).toBe(50);
  });

  it('suffix context uses after-file line numbers (no gutter rewind)', () => {
    const head = Array.from({ length: 145 }, (_, i) => `L${i + 1}`);
    const before = [...head, 'old_a', 'old_b', 'old_c', '## MVP', 'tail'].join('\n');
    const inserted = Array.from({ length: 46 }, (_, i) => `- item ${i}`);
    const after = [...head, ...inserted, '## MVP', 'tail'].join('\n');
    const preview = buildBeforeAfterDiff(before, after);
    const mvp = preview.lines.find((l) => l.text === '## MVP');
    expect(mvp?.type).toBe('context');
    // after: 145 head + 46 inserts → MVP at 192
    expect(mvp?.lineNumber).toBe(192);
  });

  it('hunk path with beforeContent delegates to before→after', () => {
    const before = [
      '## Phase 2',
      'done',
      '',
      '### Phase 3: LSP 통합',
      '',
      '',
      '## Phase 4',
      'later',
    ].join('\n');

    const oldText = ['### Phase 3: LSP 통합', '', ''].join('\n');
    const newText = [
      '### Phase 3: LSP 통합',
      '',
      '**핵심 목표**: JSON-RPC',
      '- initialize',
      '- hover',
    ].join('\n');

    const preview = buildEditDiffPreview(
      [{ oldText, newText }],
      before + '\n',
    );

    expect(preview.lines.some((l) => l.type === 'add' && /핵심 목표/.test(l.text))).toBe(
      true,
    );
    expect(preview.deletions).toBeLessThan(splitDiffLines(oldText).length + 5);
  });
});
