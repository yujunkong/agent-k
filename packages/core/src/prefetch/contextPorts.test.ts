/**
 * CTX-006 / CTX-009 / CTX-010 / CTX-012 — focused unit coverage for ports
 * that lacked dedicated v2.1 unit suites (WorkspaceIndexer, MentionExtractor,
 * FileIntent, ChatSearchIndex).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceIndexer } from '../indexing/WorkspaceIndexer';
import {
  extractMentions,
  hasCodebaseMention,
  parseFileMentionQuery,
} from './MentionExtractor';
import {
  listUnresolvedFileTargets,
  resolveFileIntent,
  resolveFileIntents,
} from './FileIntent';
import { ChatSearchIndex } from '../search/ChatSearchIndex';
import { parseStackTrace } from './StackTraceParser';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('CTX-006 WorkspaceIndexer', () => {
  it('indexes symbols via injected WorkspaceFs (no vscode)', async () => {
    const indexer = new WorkspaceIndexer({
      findTextFiles: async () => [
        {
          fsPath: '/ws/src/Foo.ts',
          text: 'export class Foo {}\nexport function bar() {}\n',
        },
      ],
    });
    await indexer.buildIndex('/ws');
    expect(indexer.getIndexSize()).toBe(1);
    expect(indexer.findSymbol('Foo').map((e) => e.filePath)).toEqual(['/ws/src/Foo.ts']);
    expect(indexer.searchFiles('Foo')).toEqual(['/ws/src/Foo.ts']);
  });
});

describe('CTX-009 MentionExtractor', () => {
  it('parses @file with line range and @codebase', () => {
    const text = 'see @file:src/a.ts:10-20 and @codebase:auth';
    const mentions = extractMentions(text);
    expect(mentions).toHaveLength(2);
    expect(mentions[0]).toMatchObject({
      type: 'file',
      query: 'src/a.ts',
      startLine: 10,
      endLine: 20,
    });
    expect(hasCodebaseMention(text)).toBe(true);
    expect(parseFileMentionQuery('src/a.ts#L5-L8')).toEqual({
      path: 'src/a.ts',
      startLine: 5,
      endLine: 8,
    });
  });
});

describe('CTX-010 FileIntent', () => {
  it('marks missing modify targets unresolved; create stays resolved', async () => {
    const exists = async (p: string) => p === 'exists.ts';
    const create = await resolveFileIntent({ path: 'new.ts', intent: 'create' }, exists);
    expect(create).toMatchObject({ exists: false, resolution: 'resolved' });

    const modify = await resolveFileIntent({ path: 'missing.ts', intent: 'modify' }, exists);
    expect(modify).toMatchObject({ exists: false, resolution: 'unresolved' });

    const batch = await resolveFileIntents(
      [
        { path: 'exists.ts', intent: 'read' },
        { path: 'gone.ts', intent: 'modify' },
      ],
      exists
    );
    expect(listUnresolvedFileTargets(batch)).toHaveLength(1);
    expect(listUnresolvedFileTargets(batch)[0].path).toBe('gone.ts');
  });
});

describe('CTX-011 StackTraceParser', () => {
  it('extracts JS stack frames', () => {
    const frames = parseStackTrace('Error\n    at foo (/tmp/app.ts:12:3)');
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames.some((f) => f.file.includes('app.ts') && f.line === 12)).toBe(true);
  });
});

describe('CTX-012 ChatSearchIndex', () => {
  it('indexes and searches chat entries with persistence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-chat-search-'));
    tmpDirs.push(dir);
    const index = new ChatSearchIndex(dir);
    index.index({
      id: 'c1',
      type: 'chat',
      title: 'Auth bug',
      content: 'login fails with TypeError',
      path: 'conv/1',
      timestamp: 1,
      tags: ['auth'],
    });
    expect(index.search('TypeError')[0]?.id).toBe('c1');
    expect(index.count).toBe(1);

    const reloaded = new ChatSearchIndex(dir);
    reloaded.loadAll();
    expect(reloaded.search('Auth')[0]?.title).toBe('Auth bug');
  });
});
