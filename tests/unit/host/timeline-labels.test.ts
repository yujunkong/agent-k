import * as assert from 'assert';
import {
  formatReadLineWindow,
  pickExploreDetail,
  resultDetail,
  shortDetail
} from '../../../src/host/timelineLabels.ts';

suite('read line-window labels', () => {
  test('always shows L-range even when offset is omitted', () => {
    assert.strictEqual(
      shortDetail('read_file', { path: 'src/chat/WorkTimeline.tsx' }),
      'WorkTimeline.tsx L1-250'
    );
  });

  test('uses offset/limit from args (string or number)', () => {
    assert.strictEqual(
      shortDetail('read_file', { path: 'WorkTimeline.tsx', offset: 1, limit: 80 }),
      'WorkTimeline.tsx L1-80'
    );
    assert.strictEqual(
      shortDetail('read_file', { path: 'a.ts', offset: '520', limit: '90' }),
      'a.ts L520-609'
    );
  });

  test('upgrades Read rows from executed startLine/endLine, not abs path', () => {
    const endDetail = resultDetail(
      'reading',
      {
        success: true,
        data: {
          path: 'D:/workspace/agent-k/src/chat/WorkTimeline.tsx',
          startLine: 1,
          endLine: 80
        }
      },
      'read_file'
    );
    assert.strictEqual(endDetail, 'WorkTimeline.tsx L1-80');
    assert.strictEqual(
      pickExploreDetail({
        name: 'read_file',
        kind: 'reading',
        success: true,
        startDetail: 'WorkTimeline.tsx L1-250',
        endDetail
      }),
      'WorkTimeline.tsx L1-80'
    );
  });

  test('keeps Grep pattern in path from start detail', () => {
    assert.strictEqual(
      pickExploreDetail({
        name: 'grep',
        kind: 'searching',
        success: true,
        startDetail: 'subagent in src',
        endDetail: '12 match(es)'
      }),
      'subagent in src'
    );
  });

  test('formatReadLineWindow prefers result window', () => {
    assert.strictEqual(
      formatReadLineWindow('foo.ts', { startLine: 10, endLine: 50 }),
      'foo.ts L10-50'
    );
  });
});
