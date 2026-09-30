/**
 * V31-CTX-05 — pure workspace context builder.
 */
import { describe, expect, it } from 'vitest';
import {
  hasWorkspaceContent,
  workspaceContextFromSnapshot,
} from './workspaceContextPure';

describe('V31-CTX-05 workspaceContextPure', () => {
  it('builds a WorkspaceContext block from a snapshot', () => {
    const ctx = workspaceContextFromSnapshot({
      roots: [{ name: 'proj', path: '/repo/proj' }],
      openFiles: ['src/index.ts'],
      activeFile: 'src/index.ts',
      cwd: '/repo/proj',
    });
    const block = ctx.toPromptBlock();
    expect(block).toContain('## Workspace');
    expect(block).toContain('/repo/proj');
    expect(block).toContain('src/index.ts');
  });

  it('hasWorkspaceContent is false for an empty snapshot', () => {
    expect(hasWorkspaceContent({ roots: [], openFiles: [] })).toBe(false);
  });

  it('hasWorkspaceContent is true when only an active file exists', () => {
    expect(hasWorkspaceContent({ roots: [], openFiles: [], activeFile: 'a.ts' })).toBe(
      true,
    );
  });
});
