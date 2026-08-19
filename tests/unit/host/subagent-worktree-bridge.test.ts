/**
 * Host bridge handlers for worktree.review / apply / reject webview messages.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  handleWorktreeApplyMessage,
  handleWorktreeRejectMessage,
  handleWorktreeReviewMessage
} from '../../../src/host/subagentWorktreeBridge';
import {
  clearSubagentWorktreeRegistry,
  registerSubagentWorktree
} from '../../../src/host/subagentWorktreeRegistry';

suite('subagentWorktreeBridge', () => {
  teardown(() => {
    clearSubagentWorktreeRegistry();
  });

  test('worktree.review requires subagentId', async () => {
    const posted: Record<string, unknown>[] = [];
    const webview = {
      postMessage: async (payload: Record<string, unknown>) => {
        posted.push(payload);
      }
    } as unknown as vscode.Webview;

    await handleWorktreeReviewMessage(webview, { requestId: 'r1' });
    assert.strictEqual(posted.length, 1);
    assert.strictEqual(posted[0].type, 'worktree.review.result');
    assert.strictEqual(posted[0].success, false);
    assert.ok(String(posted[0].error).includes('subagentId'));
  });

  test('worktree.review returns error when task is not registered', async () => {
    const posted: Record<string, unknown>[] = [];
    const webview = {
      postMessage: async (payload: Record<string, unknown>) => {
        posted.push(payload);
      }
    } as unknown as vscode.Webview;

    await handleWorktreeReviewMessage(webview, {
      subagentId: 'subagent-x',
      requestId: 'r2'
    });
    assert.strictEqual(posted[0].type, 'worktree.review.result');
    assert.strictEqual(posted[0].success, false);
    assert.ok(String(posted[0].error).includes('Unknown subagent task'));
  });

  test('worktree.apply returns structured failure for unknown task', async () => {
    const posted: Record<string, unknown>[] = [];
    const webview = {
      postMessage: async (payload: Record<string, unknown>) => {
        posted.push(payload);
      }
    } as unknown as vscode.Webview;

    await handleWorktreeApplyMessage(webview, {
      subagentId: 'missing',
      requestId: 'r3'
    });
    assert.strictEqual(posted[0].type, 'worktree.apply.result');
    assert.strictEqual(posted[0].success, false);
    assert.strictEqual(posted[0].applied, false);
  });

  test('worktree.reject requires subagentId', async () => {
    const posted: Record<string, unknown>[] = [];
    const webview = {
      postMessage: async (payload: Record<string, unknown>) => {
        posted.push(payload);
      }
    } as unknown as vscode.Webview;

    await handleWorktreeRejectMessage(webview, { requestId: 'r4' });
    assert.strictEqual(posted[0].type, 'worktree.reject.result');
    assert.strictEqual(posted[0].success, false);
  });

  test('registered task is visible to review handler until removed', async () => {
    registerSubagentWorktree('subagent-y', process.cwd(), {
      path: '/nonexistent/worktree/path',
      branch: 'subagent/y',
      base: 'deadbeef'
    });

    const posted: Record<string, unknown>[] = [];
    const webview = {
      postMessage: async (payload: Record<string, unknown>) => {
        posted.push(payload);
      }
    } as unknown as vscode.Webview;

    await handleWorktreeReviewMessage(webview, {
      subagentId: 'subagent-y',
      requestId: 'r5'
    });
    assert.strictEqual(posted[0].type, 'worktree.review.result');
    assert.strictEqual(posted[0].subagentId, 'subagent-y');
    assert.strictEqual(posted[0].success, false);
    assert.ok(String(posted[0].error).length > 0);
  });
});
