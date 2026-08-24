/**
 * CTX-008 / ADDON-T17 — local TF-IDF semantic search (ported from
 * v2.1 tests/unit/indexing/semantic-local-embedding.test.ts; mocha→vitest).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseIndexer } from './CodebaseIndexer';
import { SemanticSearch, rankByTfIdf } from './SemanticSearch';

const tmpDirs: string[] = [];

function makeIndexer(): { indexer: CodebaseIndexer; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-semsearch-'));
  tmpDirs.push(dir);
  const indexDir = path.join(dir, '.index');
  return { indexer: new CodebaseIndexer(indexDir), dir };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('CTX-008 SemanticSearch local embedding', () => {
  it('rankByTfIdf ranks documents sharing query terms above unrelated ones', () => {
    const docs = [
      { id: 'a', content: 'function calculateTotalPrice(items) { return sum(items); }' },
      { id: 'b', content: 'export class UserAuthentication { login() {} }' },
      { id: 'c', content: 'const totalPrice = calculateTotalPrice(cart.items);' },
    ];
    const ranked = rankByTfIdf('calculate total price', docs, 10);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    const ids = ranked.map((r) => r.id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    if (ids.includes('b')) {
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('b'));
    }
  });

  it('rankByTfIdf returns empty for empty query or empty corpus', () => {
    expect(rankByTfIdf('', [{ id: 'a', content: 'x' }])).toEqual([]);
    expect(rankByTfIdf('query', [])).toEqual([]);
  });

  it('enableLocalEmbedding(false) uses grep fallback with method "grep"', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    const { results, method } = semantic.search('nonexistent_query_term', 10);
    expect(method).toBe('grep');
    expect(results).toEqual([]);
  });

  it('embeddingSearch returns ranked results when local embedding is on', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-semsearch-src-'));
    tmpDirs.push(dir);
    const filePath = path.join(dir, 'sample.ts');
    fs.writeFileSync(
      filePath,
      [
        'export function authenticateUser(username: string, password: string) {',
        '  return checkCredentials(username, password);',
        '}',
        '',
        'export function unrelatedMathHelper(a: number, b: number) {',
        '  return a + b;',
        '}',
      ].join('\n')
    );
    const indexDir = path.join(dir, '.index');
    const indexer = new CodebaseIndexer(indexDir);
    indexer.indexFile(filePath);

    const semantic = new SemanticSearch(indexer);
    semantic.enableLocalEmbedding(true);
    const { results, method } = semantic.search('authenticate user credentials', 5);

    expect(method).toBe('embedding');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].filePath).toBe(filePath);
  });

  it('embeddingSearch falls back to grep when index is empty', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    semantic.enableLocalEmbedding(true);
    const { results, method } = semantic.search('anything', 5);
    expect(method).toBe('grep');
    expect(results).toEqual([]);
  });

  it('isLocalEmbeddingEnabled reflects toggles', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    expect(semantic.isLocalEmbeddingEnabled()).toBe(false);
    semantic.enableLocalEmbedding(true);
    expect(semantic.isLocalEmbeddingEnabled()).toBe(true);
    semantic.enableLocalEmbedding(false);
    expect(semantic.isLocalEmbeddingEnabled()).toBe(false);
  });

  it('hasEmbeddingModel true when local embedding enabled', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    expect(semantic.hasEmbeddingModel()).toBe(false);
    semantic.enableLocalEmbedding(true);
    expect(semantic.hasEmbeddingModel()).toBe(true);
  });

  it('getSearchSuggestion documents TF-IDF limitation when enabled', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    semantic.enableLocalEmbedding(true);
    expect(semantic.getSearchSuggestion()).toMatch(/TF-IDF/i);
  });

  it('CodebaseIndexer.getAllChunks exposes the full corpus', () => {
    const { indexer, dir } = makeIndexer();
    const filePath = path.join(dir, 'a.ts');
    fs.writeFileSync(filePath, 'const x = 1;\n');
    indexer.indexFile(filePath);
    const chunks = indexer.getAllChunks();
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].filePath).toBe(filePath);
  });
});
