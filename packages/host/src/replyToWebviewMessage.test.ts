/**
 * HOST-001~015 — host unit tests (no vscode runtime where possible).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { AGENT_K_COMMAND_IDS } from './commandIds';
import {
  flattenProjectConfig,
  parseProjectConfigJson,
  unflattenProjectConfig,
} from './configPure';
import { getNonce } from './nonce';
import { classifyProbeResult } from './providerProbePure';
import { replyToWebviewMessage } from './replyToWebviewMessage';
import {
  modeForSubagentRole,
  promptFromTaskArgs,
  roleFromTaskArgs,
} from './subagentHost';
import {
  clearSubagentWorktreeRegistry,
  getRegisteredSubagentWorktree,
  registerSubagentWorktree,
  unregisterSubagentWorktree,
} from './subagentWorktreeRegistry';
import {
  formatReadLineWindow,
  kindVerb,
  shortDetail,
  toolKind,
} from './timelineLabels';
import { buildWebviewCsp } from './webviewCsp';
import { getWebviewHtml } from './webviewHtml';
import {
  resolveWorkspaceRelativeSegments,
  toWorkspaceRelativePath,
} from './workspacePaths';
import { WorktreeManager } from './worktreeManager';

describe('EXT-001 replyToWebviewMessage', () => {
  it('replies host.hello to ui.ready', () => {
    const reply = replyToWebviewMessage(
      { type: 'ui.ready', protocolVersion: PROTOCOL_VERSION },
      '3.0.0-test',
    );
    expect(reply).toEqual({
      type: 'host.hello',
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion: '3.0.0-test',
    });
  });
});

describe('EXT-003 command catalog', () => {
  it('lists command ids synced with package.json', () => {
    expect(AGENT_K_COMMAND_IDS).toHaveLength(21);
    const pkgPath = path.resolve(__dirname, '../../../extensions/agent-k/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      contributes: { commands: Array<{ command: string }> };
    };
    expect([...AGENT_K_COMMAND_IDS].sort()).toEqual(
      pkg.contributes.commands.map((c) => c.command).sort(),
    );
  });
});

describe('EXT-004 CSP / nonce', () => {
  it('builds nonce CSP html', () => {
    expect(getNonce(16)).toHaveLength(16);
    const csp = buildWebviewCsp({ nonce: 'n', cspSource: 'https://x' });
    expect(csp).toContain("script-src 'nonce-n'");
    const html = getWebviewHtml({
      nonce: 'n',
      cspSource: 'https://x',
      scriptUri: 's.js',
      styleUri: 's.css',
    });
    expect(html).toContain('id="chat-root"');
  });
});

describe('EXT-005 / HOST path helpers', () => {
  const folder = { fsPath: '/home/user/project' };
  it('resolves and rejects unsafe paths', () => {
    expect(resolveWorkspaceRelativeSegments('src/a.ts', folder, 'posix')).toEqual([
      'src',
      'a.ts',
    ]);
    expect(toWorkspaceRelativePath('../x', folder, 'posix')).toBeNull();
  });
});

describe('HOST-014 timelineLabels', () => {
  it('maps tool names to WorkEventKind and formats read windows', () => {
    expect(toolKind('grep')).toBe('searching');
    expect(toolKind('read_file')).toBe('reading');
    expect(toolKind('run_terminal_cmd')).toBe('running');
    expect(kindVerb('searching')).toBe('Searching');
    expect(formatReadLineWindow('a/b.ts', { offset: 10, limit: 20 })).toBe('a/b.ts L10-29');
    expect(formatReadLineWindow('crates/app/Cargo.toml', {})).toBe('app/Cargo.toml L1-250');
    expect(shortDetail('grep', { pattern: 'foo', path: 'src' })).toBe('foo in src');
  });
});

describe('HOST-002 isTrueEmptyModelReply', () => {
  it('flags truly empty turns only', async () => {
    const { isTrueEmptyModelReply } = await import('./chatSendEmpty');
    expect(
      isTrueEmptyModelReply({
        finalBody: '',
        streamedChars: 0,
        reasoningChars: 0,
        toolEvents: 0,
      }),
    ).toBe(true);
    expect(
      isTrueEmptyModelReply({
        finalBody: '',
        streamedChars: 0,
        reasoningChars: 0,
        toolEvents: 1,
      }),
    ).toBe(false);
    expect(
      isTrueEmptyModelReply({
        finalBody: '',
        streamedChars: 0,
        reasoningChars: 263,
        toolEvents: 0,
      }),
    ).toBe(false);
  });
});

describe('HOST-004 config flatten/parse', () => {
  it('round-trips nested project config', () => {
    const flat = flattenProjectConfig({ provider: { model: 'm1' } });
    expect(flat['agent-k.provider.model']).toBe('m1');
    expect(unflattenProjectConfig(flat)).toEqual({ provider: { model: 'm1' } });
    expect(parseProjectConfigJson('{"provider":{"type":"ollama"}}').ok).toBe(true);
    expect(parseProjectConfigJson('not-json').ok).toBe(false);
  });
});

describe('HOST-010 classifyProbeResult', () => {
  it('classifies HTTP outcomes', () => {
    expect(classifyProbeResult(true, 200)).toBe('healthy');
    expect(classifyProbeResult(false, 401)).toBe('degraded');
    expect(classifyProbeResult(false, 500)).toBe('offline');
  });
});

describe('HOST-011 subagent helpers', () => {
  it('derives prompt / role / mode', () => {
    expect(promptFromTaskArgs({ prompt: 'do x', subtasks: ['a', 'b'] })).toContain(
      'Subtasks',
    );
    expect(roleFromTaskArgs({ role: 'explore' })).toBe('research');
    expect(modeForSubagentRole('research')).toBe('ask');
    expect(modeForSubagentRole('coding')).toBe('agent');
  });
});

describe('HOST-013 subagent worktree registry', () => {
  it('registers and clears entries', () => {
    clearSubagentWorktreeRegistry();
    registerSubagentWorktree('t1', '/repo', { path: '/repo/.wt', branch: 'b' });
    expect(getRegisteredSubagentWorktree('t1')?.repoRoot).toBe('/repo');
    unregisterSubagentWorktree('t1');
    expect(getRegisteredSubagentWorktree('t1')).toBeUndefined();
  });
});

describe('HOST-015 WorktreeManager', () => {
  it('exposes createWorktreeManager-compatible class', () => {
    const mgr = new WorktreeManager('/tmp/not-a-real-repo-for-unit-test');
    expect(mgr).toBeInstanceOf(WorktreeManager);
  });
});
