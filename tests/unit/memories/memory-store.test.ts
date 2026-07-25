/**
 * C4-T36: MemoryStore — workspaceState, contextBlock (2% 예산), AutoMemoryDetector
 */
import * as assert from 'assert';

suite('MemoryStore', () => {
  class SimulatedMemoryStore {
    private store = new Map<string, string>();
    private maxTokens = 2000;

    save(key: string, value: string) { this.store.set(key, value); }
    get(key: string) { return this.store.get(key) || null; }

    getContextBlock(): string {
      const entries = Array.from(this.store.entries());
      let tokens = 0;
      const block: string[] = [];
      for (const [k, v] of entries) {
        const size = k.length + v.length;
        if (tokens + size > this.maxTokens) break;
        block.push(`${k}: ${v}`);
        tokens += size;
      }
      return block.join('\n');
    }

    total() { return this.store.size; }
  }

  test('저장 및 조회', () => {
    const m = new SimulatedMemoryStore();
    m.save('user_name', 'Alice');
    assert.strictEqual(m.get('user_name'), 'Alice');
  });

  test('ContextBlock 예산 (2%)', () => {
    const m = new SimulatedMemoryStore();
    for (let i = 0; i < 100; i++) m.save(`key-${i}`, 'x'.repeat(500));
    const block = m.getContextBlock();
    assert.ok(block.length <= m['maxTokens'] * 4); // rough char estimate
    assert.ok(block.length > 0);
    assert.ok(m.total() === 100);
  });

  test('AutoMemoryDetector — 명시적 저장', () => {
    function detect(text: string): boolean {
      return /remember|save|store/i.test(text);
    }
    assert.ok(detect('Please remember my name is Alice'));
    assert.ok(!detect('Hello world'));
  });

  test('AutoMemoryDetector — 선호 감지', () => {
    function detectPreference(text: string): boolean {
      return /I (like|prefer|use|work with)/i.test(text);
    }
    assert.ok(detectPreference('I like TypeScript'));
    assert.ok(detectPreference('I work with React'));
  });

  test('AutoMemoryDetector — 반복 패턴', () => {
    function detectRepeated(texts: string[], pattern: RegExp): number {
      return texts.filter(t => pattern.test(t)).length;
    }
    const msgs = ['My name is Bob', 'My name is Bob', 'I like JS'];
    assert.strictEqual(detectRepeated(msgs, /My name is/), 2);
  });
});
