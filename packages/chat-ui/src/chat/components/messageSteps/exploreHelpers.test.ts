import { describe, expect, it } from 'vitest';
import {
  MID_THOUGHT_DISPLAY_MAX,
  THOUGHT_DISPLAY_MAX,
  fileBasename,
  formatExploreDetail,
  formatRollingTool,
  formatThoughtTitle,
  shortPath,
  toolRowLabel
} from './exploreHelpers';

describe('exploreHelpers constants', () => {
  it('keeps the Thought display caps', () => {
    expect(THOUGHT_DISPLAY_MAX).toBe(16000);
    expect(MID_THOUGHT_DISPLAY_MAX).toBe(900);
  });
});

describe('fileBasename', () => {
  it('returns undefined for empty input', () => {
    expect(fileBasename()).toBeUndefined();
    expect(fileBasename('')).toBeUndefined();
    expect(fileBasename('   ')).toBeUndefined();
  });

  it('returns undefined for dot segments', () => {
    expect(fileBasename('.')).toBeUndefined();
    expect(fileBasename('..')).toBeUndefined();
    expect(fileBasename('src/.')).toBeUndefined();
  });

  it('takes the last segment for / and \\ separators', () => {
    expect(fileBasename('src/chat/components/MessageSteps.tsx')).toBe('MessageSteps.tsx');
    expect(fileBasename('src\\chat\\components\\MessageSteps.tsx')).toBe('MessageSteps.tsx');
  });

  it('truncates basenames longer than 40 chars', () => {
    const long = `${'a'.repeat(45)}.ts`;
    const out = fileBasename(long);
    expect(out).toBe(`${'a'.repeat(38)}…`);
    expect(out?.length).toBe(39);
  });

  it('keeps basenames at the 40-char boundary', () => {
    const exact = 'b'.repeat(40);
    expect(fileBasename(exact)).toBe(exact);
  });
});

describe('shortPath', () => {
  it('returns empty for missing detail', () => {
    expect(shortPath()).toBe('');
    expect(shortPath('')).toBe('');
  });

  it('keeps paths with <= 3 parts unchanged', () => {
    expect(shortPath('a.ts')).toBe('a.ts');
    expect(shortPath('src/a.ts')).toBe('src/a.ts');
    expect(shortPath('src/chat/a.ts')).toBe('src/chat/a.ts');
  });

  it('collapses deep paths to …/parent/file', () => {
    expect(shortPath('packages/chat-ui/src/chat/a.ts')).toBe('…/chat/a.ts');
    expect(shortPath('a\\b\\c\\d\\e.ts')).toBe('…/d/e.ts');
  });
});

describe('formatExploreDetail', () => {
  it('returns empty for missing detail', () => {
    expect(formatExploreDetail()).toBe('');
  });

  it('preserves "pattern in path" details', () => {
    expect(formatExploreDetail('useState in src/chat')).toBe('useState in src/chat');
  });

  it('preserves line-range details', () => {
    expect(formatExploreDetail('MessageSteps.tsx L10-50')).toBe('MessageSteps.tsx L10-50');
  });

  it('caps formatted details at 100 chars', () => {
    const long = `${'x'.repeat(60)} in ${'y'.repeat(60)}`;
    const out = formatExploreDetail(long);
    expect(out).toBe(`${long.slice(0, 97)}…`);
    expect(out.length).toBe(98);
  });

  it('collapses plain paths via shortPath', () => {
    expect(formatExploreDetail('packages/chat-ui/src/chat/a.ts')).toBe('…/chat/a.ts');
  });
});

describe('toolRowLabel', () => {
  it('maps explore tool names', () => {
    const cases: Array<[string, string]> = [
      ['read_file', 'Read'],
      ['read_files', 'Read'],
      ['grep', 'Grepped'],
      ['glob', 'Searched'],
      ['file_search', 'Searched'],
      ['list_dir', 'Listed'],
      ['codebase_search', 'Searched codebase'],
      ['read_lints', 'Checked lints'],
      ['web_search', 'Searched web'],
      ['web_fetch', 'Fetched']
    ];
    for (const [toolName, label] of cases) {
      expect(toolRowLabel({ toolName })).toBe(label);
    }
  });

  it('maps MessageStep action tool names', () => {
    const cases: Array<[string, string]> = [
      ['edit_file', 'Edited'],
      ['write_file', 'Wrote'],
      ['delete_file', 'Deleted'],
      ['run_terminal_cmd', 'Ran'],
      ['terminal_output', 'Ran'],
      ['ask_question', 'Asked'],
      ['todo_write', 'Updated todos'],
      ['task', 'Started agent'],
      ['task_run', 'Started agent'],
      ['skill_run', 'Ran skill'],
      ['switch_mode', 'Switched mode']
    ];
    for (const [toolName, label] of cases) {
      expect(toolRowLabel({ toolName, label: toolName })).toBe(label);
    }
  });

  it('falls back to MessageStep kind when toolName is missing', () => {
    expect(toolRowLabel({ kind: 'reading', label: 'Read' })).toBe('Read');
    expect(toolRowLabel({ kind: 'searching', label: 'Search' })).toBe('Searched');
    expect(toolRowLabel({ kind: 'editing', label: 'Edit' })).toBe('Edited');
    expect(toolRowLabel({ kind: 'running', label: 'Terminal' })).toBe('Ran');
    expect(toolRowLabel({ kind: 'task', label: 'Work' })).toBe('Started agent');
  });

  it('falls back to toolName then Tool for unknown MessageStep rows', () => {
    expect(
      toolRowLabel({ kind: 'browsing', label: 'Browse', toolName: 'browser_open' })
    ).toBe('browser_open');
    expect(toolRowLabel({ kind: 'browsing', label: 'Browse' })).toBe('browse');
    expect(toolRowLabel({ kind: 'browsing' })).toBe('Tool');
  });

  it('uses TimelineStep title-first fallback', () => {
    expect(toolRowLabel({ title: 'Read auth.ts', kind: 'tool' })).toBe('Read');
    expect(toolRowLabel({ title: 'Grepping', kind: 'tool' })).toBe('Grepped');
    expect(toolRowLabel({ title: 'Searching', kind: 'tool' })).toBe('Searched');
    expect(toolRowLabel({ title: 'Listing', kind: 'tool' })).toBe('Listed');
    expect(toolRowLabel({ title: 'Thinking', kind: 'reasoning' })).toBe('Thought');
    expect(toolRowLabel({ title: 'Work · running', kind: 'generic' })).toBe('Work');
    expect(toolRowLabel({ title: '', kind: 'generic' })).toBe('Tool');
  });
});

describe('formatRollingTool', () => {
  it('uses live verbs for MessageStep rows', () => {
    const cases: Array<[string, string]> = [
      ['read_file', 'Reading'],
      ['read_files', 'Reading'],
      ['grep', 'Grepping'],
      ['glob', 'Searching'],
      ['file_search', 'Searching'],
      ['list_dir', 'Listing'],
      ['codebase_search', 'Searching codebase'],
      ['read_lints', 'Checking lints'],
      ['web_search', 'Searching web'],
      ['web_fetch', 'Fetching']
    ];
    for (const [toolName, verb] of cases) {
      expect(formatRollingTool({ toolName, itemStatus: 'running' })).toBe(verb);
    }
  });

  it('uses settled verbs for MessageStep rows', () => {
    expect(formatRollingTool({ toolName: 'read_file', itemStatus: 'done' })).toBe('Read');
    expect(formatRollingTool({ toolName: 'grep', itemStatus: 'done' })).toBe('Grepped');
    expect(formatRollingTool({ toolName: 'web_search', itemStatus: 'done' })).toBe('Searched web');
  });

  it('falls back to Working for live unknown MessageStep rows', () => {
    expect(
      formatRollingTool({ toolName: 'mcp_searxng_search', itemStatus: 'running' })
    ).toBe('Working');
    expect(formatRollingTool({ kind: 'reading', label: 'Read', itemStatus: 'running' })).toBe(
      'Reading'
    );
    expect(
      formatRollingTool({ kind: 'searching', label: 'Search', itemStatus: 'running' })
    ).toBe('Searching');
  });

  it('appends basename detail for MessageStep rows', () => {
    expect(
      formatRollingTool({
        toolName: 'read_file',
        itemStatus: 'running',
        detail: 'src/chat/a.ts'
      })
    ).toBe('Reading a.ts');
    expect(
      formatRollingTool({
        toolName: 'grep',
        itemStatus: 'done',
        detail: 'useState in src/chat'
      })
    ).toBe('Grepped useState in src/chat');
    expect(
      formatRollingTool({ toolName: 'read_file', itemStatus: 'done', detail: 'a.ts L10-50' })
    ).toBe('Read a.ts L10-50');
  });

  it('uses TimelineStep live verbs (ExploreChrome mapping)', () => {
    expect(formatRollingTool({ title: 'Read', toolName: 'read_file', status: 'running' })).toBe(
      'Reading'
    );
    expect(formatRollingTool({ title: 'Grepped', toolName: 'grep', status: 'running' })).toBe(
      'Grepping'
    );
    expect(formatRollingTool({ title: 'Searched', toolName: 'glob', status: 'running' })).toBe(
      'Searching'
    );
    expect(formatRollingTool({ title: 'Listed', toolName: 'list_dir', status: 'running' })).toBe(
      'Listing'
    );
    expect(
      formatRollingTool({ title: 'Searched codebase', toolName: 'codebase_search', status: 'running' })
    ).toBe('Searching codebase');
  });

  it('keeps ExploreChrome settled verbs for web tools', () => {
    expect(
      formatRollingTool({ title: 'Searched web', toolName: 'web_search', status: 'running' })
    ).toBe('Searched web');
    expect(formatRollingTool({ title: 'Fetched', toolName: 'web_fetch', status: 'running' })).toBe(
      'Fetched'
    );
  });

  it('appends subtitle detail for TimelineStep rows', () => {
    expect(
      formatRollingTool({
        title: 'Read',
        toolName: 'read_file',
        status: 'running',
        subtitle: 'src/chat/a.ts'
      })
    ).toBe('Reading a.ts');
    expect(
      formatRollingTool({
        title: 'Grepped',
        toolName: 'grep',
        status: 'running',
        subtitle: 'useState in src/chat'
      })
    ).toBe('Grepping useState in src/chat');
  });
});

describe('formatThoughtTitle', () => {
  it('handles plan-generate steps by id', () => {
    const base = { id: 'tl_plan_v2_generate', label: 'Creating plan' };
    expect(formatThoughtTitle({ ...base, itemStatus: 'running' }, true)).toBe('Creating plan');
    expect(formatThoughtTitle({ ...base, itemStatus: 'error' }, false)).toBe(
      'Failed to create plan'
    );
    expect(formatThoughtTitle({ ...base, itemStatus: 'done' }, false)).toBe('Created plan');
  });

  it('handles plan-generate steps by label', () => {
    expect(formatThoughtTitle({ id: 'x', label: '계획 생성', itemStatus: 'done' }, false)).toBe(
      'Created plan'
    );
    expect(
      formatThoughtTitle({ id: 'x', label: 'Failed to create plan', itemStatus: 'error' }, false)
    ).toBe('Failed to create plan');
  });

  it('handles TimelineStep plan status', () => {
    expect(
      formatThoughtTitle({ id: 'tl_plan_v2_generate', title: 'Plan', status: 'failed' }, false)
    ).toBe('Failed to create plan');
    expect(
      formatThoughtTitle({ id: 'tl_plan_v2_generate', title: 'Plan', status: 'running' }, true)
    ).toBe('Creating plan');
  });

  it('shows Thinking while live', () => {
    expect(
      formatThoughtTitle({ id: 'tl_thinking_1', label: 'Thought', itemStatus: 'running' }, true)
    ).toBe('Thinking');
  });

  it('shows Thought Ns for material waits', () => {
    expect(
      formatThoughtTitle({ id: 'tl_thinking_1', label: 'Thought', itemStatus: 'done', durationMs: 1000 }, false)
    ).toBe('Thought 1s');
    expect(
      formatThoughtTitle({ id: 'tl_thinking_1', label: 'Thought', itemStatus: 'done', durationMs: 2500 }, false)
    ).toBe('Thought 3s');
    expect(
      formatThoughtTitle({ id: 'tl_thinking_1', label: 'Thought', itemStatus: 'done', durationMs: 999 }, false)
    ).toBe('Thought briefly');
    expect(
      formatThoughtTitle({ id: 'tl_thinking_1', label: 'Thought', itemStatus: 'done' }, false)
    ).toBe('Thought briefly');
  });

  it('keeps Thought briefly for sub-second durations', () => {
    expect(
      formatThoughtTitle({ id: 'tl_thinking_1', label: 'Thought', itemStatus: 'done', durationMs: 0 }, false)
    ).toBe('Thought briefly');
  });
});
