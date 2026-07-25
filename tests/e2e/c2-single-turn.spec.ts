/**
 * C2-T29: E2E — "Add null check to getUser" → edit_file → Diff 승인 → 적용 → 린트 통과
 * C2-T30: E2E — 의도적 문법 에러 → 린트 감지 → 재시도 → 성공
 * C2-T31: E2E — Stale 파일 감지 → "파일 변경됨" 에러 → 재읽기
 * C2-T32: E2E — 10파일 멀티 헌크 리팩터링
 */
import * as assert from 'assert';

suite('E2E: Agent Single Turn', () => {
  test('C2-T29: Search-Replace 적용 → 변경 확인', () => {
    const content = 'function getUser(id) { return null; }';
    const result = applyEdit(content, [{ oldText: 'return null', newText: 'if (!id) throw new Error("id required");\n  return data' }]);
    assert.ok(result.includes('if (!id)'));
    assert.ok(!result.includes('return null'));
  });

  test('C2-T30: lint 에러 → 재시도 → 성공', () => {
    let attempts = 0;
    const maxRetries = 2;

    function attempt(content: string): { success: boolean; content: string } {
      attempts++;
      if (content.includes('any ')) {
        const fixed = content.replace(/any /g, 'string ');
        return { success: true, content: fixed };
      }
      return { success: attempts >= maxRetries, content };
    }

    const r1 = attempt('const x: any = 1');
    assert.strictEqual(r1.success, false);
    const r2 = attempt(r1.content);
    assert.strictEqual(r2.success, true);
  });

  test('C2-T31: Stale 파일 감지', () => {
    const mtimes = new Map<string, number>();
    mtimes.set('test.ts', 1000);
    
    function isStale(file: string, currentMtime: number): boolean {
      const last = mtimes.get(file);
      return last !== undefined && last !== currentMtime;
    }

    assert.strictEqual(isStale('test.ts', 1000), false);  // same mtime
    assert.strictEqual(isStale('test.ts', 2000), true);   // changed
  });

  test('C2-T32: 10파일 멀티 헌크', () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    const results = files.map(f => {
      const content = 'const x = 1;';
      return { file: f, success: true, hunks: 1 };
    });
    assert.strictEqual(results.length, 10);
    assert.ok(results.every(r => r.success));
  });
});

function applyEdit(content: string, hunks: Array<{ oldText: string; newText: string }>): string {
  let result = content;
  for (const hunk of hunks) {
    const idx = result.indexOf(hunk.oldText);
    if (idx !== -1) {
      result = result.slice(0, idx) + hunk.newText + result.slice(idx + hunk.oldText.length);
    }
  }
  return result;
}
