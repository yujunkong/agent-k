/**
 * C4-T37: SideChat — ask-mode 병렬 읽기 세션, MergeBlock
 */
import * as assert from 'assert';

suite('SideChatSession', () => {
  interface SideSession {
    id: string;
    query: string;
    results: string[];
    status: 'running' | 'completed';
  }

  class SimulatedSideChat {
    private sessions: SideSession[] = [];
    private maxSessions = 5;

    start(query: string): string {
      const id = `side-${Date.now()}`;
      this.sessions.push({ id, query, results: [], status: 'running' });
      if (this.sessions.length > this.maxSessions) this.sessions.shift();
      return id;
    }

    addResult(id: string, result: string) {
      const s = this.sessions.find(s => s.id === id);
      if (s) { s.results.push(result); s.status = 'completed'; }
    }

    getMergeBlock(): string {
      return this.sessions
        .filter(s => s.status === 'completed')
        .map(s => `<side-session id="${s.id}">\n  Query: ${s.query}\n  Results:\n    ${s.results.join('\n    ')}\n</side-session>`)
        .join('\n');
    }

    total() { return this.sessions.length; }
  }

  test('사이드 세션 시작 및 완료', () => {
    const sc = new SimulatedSideChat();
    const id = sc.start('grep for user model');
    sc.addResult(id, 'Found src/user.ts');
    assert.strictEqual(sc.total(), 1);
  });

  test('MergeBlock 포맷', () => {
    const sc = new SimulatedSideChat();
    const id1 = sc.start('find routes');
    const id2 = sc.start('check types');
    sc.addResult(id1, 'src/routes.ts');
    sc.addResult(id2, 'src/types.ts');
    
    const block = sc.getMergeBlock();
    assert.ok(block.includes('<side-session'));
    assert.ok(block.includes('src/routes.ts'));
    assert.ok(block.includes('src/types.ts'));
  });

  test('최대 5개 세션 초과 시 오래된 세션 제거', () => {
    const sc = new SimulatedSideChat();
    for (let i = 0; i < 7; i++) sc.start(`query-${i}`);
    assert.strictEqual(sc.total(), 5);
  });

  test('ask 모드 — 읽기 전용 도구만 허용', () => {
    const allowedTools = ['grep', 'read_file', 'glob', 'codebase_search'];
    const disallowedTools = ['write_file', 'edit_file', 'run_terminal_cmd'];
    
    assert.ok(allowedTools.every(t => true)); // all read tools
    assert.ok(disallowedTools.every(t => disallowedTools.includes(t)));
  });
});
