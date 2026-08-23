import { describe, expect, it } from 'vitest';
import { collectSubagentTimeline } from './SubagentDetailView';

describe('collectSubagentTimeline (deprecated)', () => {
  it('returns empty — child ChatSession is the source of truth (SUB-010)', () => {
    const result = collectSubagentTimeline(
      [
        {
          role: 'assistant',
          status: 'streaming',
          workItems: [
            {
              id: 'tl_subagent_a',
              type: 'subagent',
              status: 'running',
              label: 'x',
              subagentId: 'a'
            }
          ]
        }
      ],
      'a'
    );
    expect(result.items).toEqual([]);
    expect(result.isStreaming).toBe(false);
  });
});
