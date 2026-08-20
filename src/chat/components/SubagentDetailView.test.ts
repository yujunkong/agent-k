import { describe, expect, it } from 'vitest';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import { collectSubagentTimeline } from './SubagentDetailView';

describe('collectSubagentTimeline', () => {
  it('is not streaming after the header completes even if Thought is still running', () => {
    const thought: ConversationWorkEvent = {
      id: 'tl_sub_a_thought',
      type: 'thinking',
      status: 'running',
      label: 'Thought',
      subagentId: 'a'
    };
    const header: ConversationWorkEvent = {
      id: 'tl_subagent_a',
      type: 'subagent',
      status: 'complete',
      label: 'Research auth · completed',
      subagentId: 'a'
    };
    const result = collectSubagentTimeline(
      [{ role: 'assistant', status: 'streaming', workItems: [thought, header] }],
      'a'
    );
    expect(result.isStreaming).toBe(false);
    expect(result.items.map((i) => i.id)).toEqual(['tl_sub_a_thought']);
    expect(result.items[0].subagentId).toBeUndefined();
  });

  it('stays streaming while the header is still running', () => {
    const header: ConversationWorkEvent = {
      id: 'tl_subagent_a',
      type: 'subagent',
      status: 'running',
      label: 'Research auth · running',
      subagentId: 'a'
    };
    const result = collectSubagentTimeline(
      [{ role: 'assistant', status: 'streaming', workItems: [header] }],
      'a'
    );
    expect(result.isStreaming).toBe(true);
  });

  it('attaches file edits by toolId prefix without a work-event ref', () => {
    const edit: ConversationWorkEvent = {
      id: 'tl_sub_a_call1',
      type: 'edit',
      status: 'complete',
      label: 'Edit',
      subagentId: 'a'
    };
    const result = collectSubagentTimeline(
      [
        {
          role: 'assistant',
          workItems: [edit],
          fileEdits: [
            {
              id: 'fe_1',
              path: 'src/a.ts',
              toolId: 'tl_sub_a_call1',
              additions: 4,
              deletions: 1,
              lines: []
            }
          ]
        }
      ],
      'a'
    );
    expect(result.fileEdits).toHaveLength(1);
    expect(result.fileEdits[0].path).toBe('src/a.ts');
  });

  it('exposes header duration for the Worked-for label', () => {
    const result = collectSubagentTimeline(
      [
        {
          role: 'assistant',
          workItems: [
            {
              id: 'tl_subagent_a',
              type: 'subagent',
              status: 'complete',
              label: 'Agent',
              subagentId: 'a',
              result: { durationMs: 346000 }
            }
          ]
        }
      ],
      'a'
    );
    expect(result.workedDurationMs).toBe(346000);
  });
});
