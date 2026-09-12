/**
 * MEM-001~004 unit tests (v2.1 동작 동등)
 */
import { describe, it, expect } from 'vitest';
import {
  MemoryStore,
  type SecretStoragePort,
} from './MemoryStore';
import { AutoMemoryDetector } from './AutoMemoryDetector';
import { checkMemoryFeature } from './MemoryFeature';

/** In-memory SecretStorage port stub for tests. */
function memoryStorage(): SecretStoragePort & { backing: Map<string, string> } {
  const backing = new Map<string, string>();
  return {
    backing,
    async get(key) {
      return backing.get(key);
    },
    async store(key, value) {
      backing.set(key, value);
    },
    async delete(key) {
      backing.delete(key);
    },
  };
}

describe('MEM-001 MemoryStore', () => {
  it('set/get round-trips', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('editor', 'vim');
    expect(await store.get('editor')).toBe('vim');
  });

  it('set updates existing entry preserving createdAt/category', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('editor', 'vim', 'tools');
    const first = (await store.getAllMemories())[0];
    await store.set('editor', 'neovim');
    const second = (await store.getAllMemories())[0];
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.category).toBe('tools');
    expect(second.value).toBe('neovim');
  });

  it('delete removes entry', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('a', '1');
    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  it('clear removes all memories', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('a', '1');
    await store.set('b', '2');
    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });

  it('slot budget evicts oldest entry when full', async () => {
    const store = new MemoryStore(memoryStorage(), { maxSlots: 2 });
    await store.set('a', '1');
    await store.set('b', '2');
    await store.set('c', '3'); // 'a' (oldest) evicted
    expect(await store.get('a')).toBeUndefined();
    expect(await store.get('b')).toBe('2');
    expect(await store.get('c')).toBe('3');
    expect(store.getMemoryUsage().used).toBe(2);
  });

  it('persists across store instances via storage port', async () => {
    const storage = memoryStorage();
    const first = new MemoryStore(storage);
    await first.set('editor', 'vim');

    const second = new MemoryStore(storage);
    expect(await second.get('editor')).toBe('vim');
  });

  it('getAllMemories sorts by updatedAt desc', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('a', '1');
    await store.set('b', '2');
    await store.set('a', '1-updated');
    const entries = await store.getAllMemories();
    expect(entries[0].key).toBe('a');
  });
});

describe('MEM-001 injectMemoriesIntoPrompt', () => {
  it('appends memory block when no tag exists', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('editor', 'vim');
    const prompt = store.injectMemoriesIntoPrompt('base', 1000);
    expect(prompt).toContain('<memories>');
    expect(prompt).toContain('- editor: vim');
    expect(prompt).toContain('</memories>');
  });

  it('replaces existing <memories> block', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('editor', 'vim');
    const prompt = store.injectMemoriesIntoPrompt('base\n<memories>\nold\n</memories>', 1000);
    expect(prompt).not.toContain('old');
    expect(prompt).toContain('- editor: vim');
  });

  it('respects budgetChars truncation', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('k1', 'x'.repeat(200));
    await store.set('k2', 'y'.repeat(200));
    // overhead ~25 chars → budget 240 leaves ~215: k1 line(206) fits, k2 does not
    const prompt = store.injectMemoriesIntoPrompt('base', 240);
    expect(prompt).toContain('k1');
    expect(prompt).not.toContain('k2');
  });

  it('zero budget returns prompt unchanged', async () => {
    const store = new MemoryStore(memoryStorage());
    await store.set('editor', 'vim');
    expect(store.injectMemoriesIntoPrompt('base', 0)).toBe('base');
  });
});

describe('MEM-004 AutoMemoryDetector', () => {
  it('detects explicit save keywords', () => {
    const detector = new AutoMemoryDetector();
    const suggestions = detector.detect('기억해: 나는 vim을 쓴다');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].source).toBe('explicit_save');
    expect(suggestions[0].confidence).toBe(0.9);
  });

  it('detects preference patterns', () => {
    const detector = new AutoMemoryDetector();
    const suggestions = detector.detect('I prefer TypeScript for all new projects.');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].source).toBe('preference_pattern');
  });

  it('deduplicates suggestions', () => {
    const detector = new AutoMemoryDetector();
    const suggestions = detector.detect('remember this: prefer vim. always remember prefer vim.');
    const keys = suggestions.map((s) => s.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('detectRepeatedPreference finds phrases seen 2+ times', () => {
    const detector = new AutoMemoryDetector();
    const history = [
      'I prefer TypeScript.',
      'I prefer TypeScript.',
    ];
    const suggestions = detector.detectRepeatedPreference(history);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].source).toBe('repeated_pattern');
    expect(suggestions[0].confidence).toBeGreaterThan(0.5);
  });
});

describe('MEM-003 feature flag', () => {
  it('allowed by default', () => {
    expect(checkMemoryFeature().allowed).toBe(true);
  });

  it('denied when enabled === false', () => {
    const result = checkMemoryFeature({ enabled: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });
});
