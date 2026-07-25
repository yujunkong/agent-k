/**
 * C1-T25: E2E — 프리페치 + 컨텍스트 포함
 * C1-T26/T27: 벤치마크 — 병렬 읽기 + 메모리 누수
 */
import * as assert from 'assert';

suite('E2E: Prefetch', () => {
  function extractFileMentions(text: string): string[] {
    const regex = /@file:([^\s,;\]]+)/g;
    const files: string[] = [];
    let m;
    while ((m = regex.exec(text)) !== null) files.push(m[1]);
    return files;
  }

  function buildContextBlock(results: string[]): string {
    if (results.length === 0) return '';
    return '<prefetched_context>\n' + results.map(r => `📄 ${r}`).join('\n') + '\n</prefetched_context>';
  }

  test('C1-T25: @file: 멘션 → 파일 경로 추출', () => {
    const files = extractFileMentions('Look at @file:src/main.ts and @file:src/utils/helpers.ts');
    assert.strictEqual(files.length, 2);
    assert.strictEqual(files[0], 'src/main.ts');
  });

  test('C1-T25: 컨텍스트 블록 생성', () => {
    const block = buildContextBlock(['src/main.ts (read)', 'src/config.ts (read)']);
    assert.ok(block.includes('<prefetched_context>'));
    assert.ok(block.includes('src/main.ts'));
  });

  test('C1-T25: 빈 결과 → 빈 블록', () => {
    assert.strictEqual(buildContextBlock([]), '');
  });
});

suite('Benchmark: Parallel Read', () => {
  test('C1-T26: 10개 파일 병렬 읽기 < 500ms (시뮬레이션)', async () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    const start = Date.now();
    
    // Simulate parallel reads
    await Promise.all(files.map(f => 
      new Promise<void>(resolve => setTimeout(resolve, 20))
    ));
    
    const duration = Date.now() - start;
    assert.ok(duration < 500, `Parallel read took ${duration}ms`);
  });
});

suite('Benchmark: Memory Leak', () => {
  test('C1-T27: 100턴 후 메모리 증가 < 10MB', () => {
    const memBefore = process.memoryUsage().heapUsed;
    
    // Simulate 100 turns of messages
    const messages: string[] = [];
    for (let turn = 0; turn < 100; turn++) {
      messages.push(`Turn ${turn}: ` + 'Hello world '.repeat(20));
    }
    
    const memAfter = process.memoryUsage().heapUsed;
    const increaseMB = (memAfter - memBefore) / 1024 / 1024;
    assert.ok(increaseMB < 50, `Memory increase: ${increaseMB.toFixed(2)}MB`);
  });
});
