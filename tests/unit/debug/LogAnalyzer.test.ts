/**
 * C6-T17: 단위 테스트 — LogAnalyzer (로그 파싱/통계/이상감지)
 */
import * as assert from 'assert';
import { LogAnalyzer } from '../../../src/debug/LogAnalyzer';
import { LogEntry } from '../../../src/debug/DebugLogServer';

suite('LogAnalyzer (C6-T17)', () => {
  const analyzer = new LogAnalyzer();

  const sampleLogs: LogEntry[] = [
    { id: '1', level: 'error', source: 'src/auth.ts', message: 'Null reference', timestamp: 1000 },
    { id: '2', level: 'error', source: 'src/auth.ts', message: 'Null reference', timestamp: 1001 },
    { id: '3', level: 'warn', source: 'src/db.ts', message: 'Slow query', timestamp: 1002 },
    { id: '4', level: 'info', source: 'src/db.ts', message: 'Connected', timestamp: 1003 },
  ];

  test('로그 파싱', () => {
    const parsed = analyzer.parseRawLogs([
      '[DEBUG] [error] src/auth.ts: Null reference',
      '[DEBUG] [warn] src/db.ts: Slow query'
    ]);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].level, 'error');
  });

  test('에러 빈도 계산', () => {
    const freq = analyzer.errorFrequency(sampleLogs);
    assert.strictEqual(freq['src/auth.ts'], 2);
    assert.strictEqual(freq['src/db.ts'], 0); // only warn/info
  });

  test('이상 패턴 감지 — 에러 폭증', () => {
    const manyLogs: LogEntry[] = Array.from({ length: 15 }, (_, i) => ({
      id: `e${i}`, level: 'error', source: 'src/crash.ts',
      message: 'Crash', timestamp: 1000 + i
    }));
    const anomalies = analyzer.detectAnomalies(manyLogs);
    assert.ok(anomalies.length > 0);
    assert.ok(anomalies.some(a => a.type === 'error_burst'));
  });

  test('이상 패턴 감지 — 빈 로그', () => {
    const anomalies = analyzer.detectAnomalies([]);
    assert.strictEqual(anomalies.length, 1);
    assert.strictEqual(anomalies[0].type, 'no_logs');
  });

  test('코릴레이션 분석', () => {
    const result = analyzer.analyze(sampleLogs);
    assert.ok(result.totalLogs > 0);
    assert.ok(result.summary.length > 0);
  });
});
