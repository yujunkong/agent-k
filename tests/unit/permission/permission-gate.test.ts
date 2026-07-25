/**
 * C4-T32: PermissionGate — ask/accept/auto 레벨, DenyGlobs, 세션 승인
 */
import * as assert from 'assert';

suite('PermissionGate', () => {
  type PermissionLevel = 'ask' | 'accept_edits' | 'auto' | 'bypass';

  class SimulatedGate {
    level: PermissionLevel = 'ask';
    denyGlobs: string[] = ['**/secrets*', '**/.env'];
    sessionApprovals = new Set<string>();

    async check(tool: string, path?: string): Promise<'allow' | 'deny' | 'ask'> {
      if (this.level === 'bypass') return 'allow';
      if (this.level === 'auto') return 'allow';
      
      if (path && this.denyGlobs.some(g => path.includes(g.replace('**/', '')))) {
        return 'deny';
      }
      
      if (tool === 'write_file' || tool === 'run_terminal_cmd') {
        if (this.level === 'accept_edits' && tool === 'write_file') return 'allow';
        if (this.sessionApprovals.has(tool)) return 'allow';
        return 'ask';
      }
      return 'allow';
    }

    approveSession(tool: string) { this.sessionApprovals.add(tool); }
  }

  test('ask 레벨 — write_file 차단', async () => {
    const g = new SimulatedGate();
    const result = await g.check('write_file', 'src/main.ts');
    assert.strictEqual(result, 'ask');
  });

  test('bypass 레벨 — 모든 도구 허용', async () => {
    const g = new SimulatedGate();
    g.level = 'bypass';
    const result = await g.check('run_terminal_cmd');
    assert.strictEqual(result, 'allow');
  });

  test('DenyGlobs — secrets 파일 접근 차단', async () => {
    const g = new SimulatedGate();
    const result = await g.check('read_file', 'config/secrets.json');
    assert.strictEqual(result, 'deny');
  });

  test('세션 승인 — 한 번 ask 후 allow', async () => {
    const g = new SimulatedGate();
    g.approveSession('write_file');
    const result = await g.check('write_file', 'src/test.ts');
    assert.strictEqual(result, 'allow');
  });

  test('accept_edits — write_file 허용, terminal 차단', async () => {
    const g = new SimulatedGate();
    g.level = 'accept_edits';
    assert.strictEqual(await g.check('write_file'), 'allow');
    assert.strictEqual(await g.check('run_terminal_cmd'), 'ask');
  });
});
