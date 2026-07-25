/**
 * C6-T15: 단위 테스트 — DebugLogServer (로그 수집/필터링/트렁케이트)
 */
import * as assert from 'assert';
import { DebugLogServer, LogEntry } from '../../../src/debug/DebugLogServer';

suite('DebugLogServer (C6-T15)', () => {
  const server = new DebugLogServer();

  test('로그 수집', () => {
    const log = server.ingest({
      level: 'error',
      source: 'src/auth.ts',
      message: 'Null reference at line 42'
    });
    assert.ok(log.id.startsWith('log-'));
    assert.strictEqual(server.logCount, 1);
  });

  test('레벨별 필터링', () => {
    server.ingest({ level: 'info', source: 'test', message: 'info msg' });
    server.ingest({ level: 'warn', source: 'test', message: 'warn msg' });
    server.ingest({ level: 'error', source: 'test', message: 'error msg' });

    const errors = server.query({ level: 'error' });
    assert.ok(errors.every(l => l.level === 'error'));
  });

  test('소스별 필터링', () => {
    const srcLogs = server.query({ source: 'src/auth.ts' });
    assert.ok(srcLogs.every(l => l.source.includes('src/auth.ts')));
  });

  test('maxLines 트렁케이트', () => {
    const limited = server.query({ maxLines: 2 });
    assert.ok(limited.length <= 2);
  });

  test('clear — 모든 로그 제거', () => {
    server.clear();
    assert.strictEqual(server.logCount, 0);
  });
});
