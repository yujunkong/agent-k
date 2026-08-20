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
    expect(result.items).toHaveLength(2);
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
});
