/**
 * ADDON-T17: local TF-IDF semantic search unit tests
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodebaseIndexer } from '../../../src/indexing/CodebaseIndexer';
import { SemanticSearch, rankByTfIdf } from '../../../src/indexing/SemanticSearch';

function makeIndexer(): { indexer: CodebaseIndexer; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-semsearch-'));
  const indexDir = path.join(dir, '.index');
  return { indexer: new CodebaseIndexer(indexDir), dir };
}

suite('ADDON-T17 SemanticSearch local embedding', () => {
  test('rankByTfIdf ranks documents sharing query terms above unrelated ones', () => {
    const docs = [
      { id: 'a', content: 'function calculateTotalPrice(items) { return sum(items); }' },
      { id: 'b', content: 'export class UserAuthentication { login() {} }' },
      { id: 'c', content: 'const totalPrice = calculateTotalPrice(cart.items);' },
    ];
    const ranked = rankByTfIdf('calculate total price', docs, 10);
    assert.ok(ranked.length >= 2);
    const ids = ranked.map((r) => r.id);
    assert.ok(ids.includes('a'));
    assert.ok(ids.includes('c'));
    // Unrelated doc ('b') either doesn't match at all or ranks below the relevant ones
    if (ids.includes('b')) {
      assert.ok(ids.indexOf('a') < ids.indexOf('b'));
      assert.ok(ids.indexOf('c') < ids.indexOf('b'));
    }
  });

  test('rankByTfIdf returns empty for empty query or empty corpus', () => {
    assert.deepStrictEqual(rankByTfIdf('', [{ id: 'a', content: 'x' }]), []);
    assert.deepStrictEqual(rankByTfIdf('query', []), []);
  });

  test('enableLocalEmbedding(false) uses grep fallback with method "grep"', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    const { results, method } = semantic.search('nonexistent_query_term', 10);
    assert.strictEqual(method, 'grep');
    assert.deepStrictEqual(results, []);
  });

  test('embeddingSearch returns ranked, non-empty results when local embedding is on and index has content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-semsearch-src-'));
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

    assert.strictEqual(method, 'embedding');
    assert.ok(results.length > 0);
    assert.ok(results[0].score > 0);
    assert.ok(results[0].filePath === filePath);
  });

  test('embeddingSearch falls back to grep when local embedding on but index is empty', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    semantic.enableLocalEmbedding(true);
    const { results, method } = semantic.search('anything', 5);
    assert.strictEqual(method, 'grep');
    assert.deepStrictEqual(results, []);
  });

  test('isLocalEmbeddingEnabled reflects enableLocalEmbedding toggles', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    assert.strictEqual(semantic.isLocalEmbeddingEnabled(), false);
    semantic.enableLocalEmbedding(true);
    assert.strictEqual(semantic.isLocalEmbeddingEnabled(), true);
    semantic.enableLocalEmbedding(false);
    assert.strictEqual(semantic.isLocalEmbeddingEnabled(), false);
  });

  test('hasEmbeddingModel true when local embedding enabled even without a real model', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    assert.strictEqual(semantic.hasEmbeddingModel(), false);
    semantic.enableLocalEmbedding(true);
    assert.strictEqual(semantic.hasEmbeddingModel(), true);
  });

  test('getSearchSuggestion documents the local TF-IDF limitation when enabled', () => {
    const { indexer } = makeIndexer();
    const semantic = new SemanticSearch(indexer);
    semantic.enableLocalEmbedding(true);
    const suggestion = semantic.getSearchSuggestion();
    assert.ok(/TF-IDF/i.test(suggestion));
  });

  test('CodebaseIndexer.getAllChunks exposes the full corpus', () => {
    const { indexer, dir } = makeIndexer();
    const filePath = path.join(dir, 'a.ts');
    fs.writeFileSync(filePath, 'const x = 1;\n');
    indexer.indexFile(filePath);
    const chunks = indexer.getAllChunks();
    assert.ok(chunks.length >= 1);
    assert.strictEqual(chunks[0].filePath, filePath);
  });
});
