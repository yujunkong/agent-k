/**
 * CTX-008 Semantic search — ported from v2.1 `src/indexing/SemanticSearch.ts`.
 * C7-T31 / ADDON-T17: local TF-IDF cosine over CodebaseIndexer chunks, else grep.
 *
 * No real embedding model/vector DB yet — `enableLocalEmbedding(true)` is lexical
 * overlap only. Host may later inject a real embedding model via setEmbeddingModel.
 */
import { CodebaseIndexer, type IndexedChunk } from './CodebaseIndexer';

export interface SemanticSearchResult {
  filePath: string;
  line: number;
  content: string;
  score: number;
}

/**
 * Tokenize source-ish text into lowercase words. Splits camelCase/PascalCase
 * and snake_case identifiers into sub-words too (e.g. "calculateTotalPrice"
 * → calculatetotalprice, calculate, total, price).
 */
function tokenize(text: string): string[] {
  const identifiers = text.match(/[A-Za-z0-9_]{2,}/g) || [];
  const tokens: string[] = [];
  for (const word of identifiers) {
    tokens.push(word.toLowerCase());
    for (const part of word.split('_')) {
      if (!part) continue;
      const subwords = part.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g) || [part];
      for (const sw of subwords) {
        if (sw.length >= 2) tokens.push(sw.toLowerCase());
      }
    }
  }
  return tokens;
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/**
 * Pure — TF-IDF weighted cosine similarity ranking over a small in-memory
 * corpus. Exported standalone for unit tests without a live indexer.
 */
export function rankByTfIdf(
  query: string,
  documents: Array<{ id: string; content: string }>,
  maxResults: number = 20
): Array<{ id: string; score: number }> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || documents.length === 0) return [];

  const docTokens = documents.map((d) => tokenize(d.content));
  const docFreq = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  const numDocs = documents.length;
  const idf = (term: string): number => Math.log((numDocs + 1) / ((docFreq.get(term) || 0) + 1)) + 1;

  const vectorize = (tokens: string[]): Map<string, number> => {
    const tf = termFrequency(tokens);
    const vec = new Map<string, number>();
    for (const [term, count] of tf) {
      vec.set(term, count * idf(term));
    }
    return vec;
  };

  const norm = (vec: Map<string, number>): number =>
    Math.sqrt(Array.from(vec.values()).reduce((sum, v) => sum + v * v, 0));

  const queryVec = vectorize(queryTokens);
  const queryNorm = norm(queryVec);
  if (queryNorm === 0) return [];

  const results: Array<{ id: string; score: number }> = [];
  for (let i = 0; i < documents.length; i++) {
    const docVec = vectorize(docTokens[i]);
    let dot = 0;
    for (const [term, qWeight] of queryVec) {
      const dWeight = docVec.get(term);
      if (dWeight) dot += qWeight * dWeight;
    }
    if (dot === 0) continue;
    const docNorm = norm(docVec);
    if (docNorm === 0) continue;
    const score = dot / (queryNorm * docNorm);
    if (score > 0) results.push({ id: documents[i].id, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

export class SemanticSearch {
  private indexer: CodebaseIndexer;
  private embeddingModel: string | null = null;
  private localEmbeddingEnabled = false;

  constructor(indexer: CodebaseIndexer) {
    this.indexer = indexer;
  }

  setEmbeddingModel(model: string): void {
    this.embeddingModel = model;
  }

  /** ADDON-T17: toggle local TF-IDF similarity (agent-k.search.localEmbedding). */
  enableLocalEmbedding(on: boolean): void {
    this.localEmbeddingEnabled = on;
  }

  isLocalEmbeddingEnabled(): boolean {
    return this.localEmbeddingEnabled;
  }

  /**
   * Search using embeddings (real model or local TF-IDF fallback) or grep.
   * Note: setEmbeddingModel alone does not run real embeddings yet — only
   * localEmbeddingEnabled drives embeddingSearch (same as v2.1).
   */
  search(
    query: string,
    maxResults: number = 20
  ): { results: SemanticSearchResult[]; method: 'embedding' | 'grep' } {
    if (this.embeddingModel || this.localEmbeddingEnabled) {
      const results = this.embeddingSearch(query, maxResults);
      if (results.length > 0) {
        return { results, method: 'embedding' };
      }
      // Empty index — fall through to grep
    }

    const chunks = this.indexer.search(query, maxResults);
    return {
      results: chunks.map((c) => ({
        filePath: c.filePath,
        line: c.startLine,
        content: this.extractRelevantLine(c.content, query),
        score: 1.0,
      })),
      method: 'grep',
    };
  }

  hasEmbeddingModel(): boolean {
    return this.embeddingModel !== null || this.localEmbeddingEnabled;
  }

  getSearchSuggestion(): string {
    if (this.localEmbeddingEnabled) {
      return 'Semantic search: using local TF-IDF similarity (agent-k.search.localEmbedding) — not a real embedding model, lexical overlap only. Enable a proper embedding model for better recall, or use grep/codebase_search for exact matches.';
    }
    return 'Semantic search: embedding model not configured. Consider setting up an embedding model or use grep/codebase_search for exact matches.';
  }

  private embeddingSearch(query: string, maxResults: number): SemanticSearchResult[] {
    if (!this.localEmbeddingEnabled) return [];
    const chunks = this.indexer.getAllChunks();
    if (chunks.length === 0) return [];

    const documents = chunks.map((c) => ({ id: c.id, content: c.content }));
    const ranked = rankByTfIdf(query, documents, maxResults);
    if (ranked.length === 0) return [];

    const byId = new Map<string, IndexedChunk>(chunks.map((c) => [c.id, c]));
    const results: SemanticSearchResult[] = [];
    for (const { id, score } of ranked) {
      const chunk = byId.get(id);
      if (!chunk) continue;
      results.push({
        filePath: chunk.filePath,
        line: chunk.startLine,
        content: this.extractRelevantLine(chunk.content, query),
        score,
      });
    }
    return results;
  }

  private extractRelevantLine(content: string, query: string): string {
    const lines = content.split('\n');
    const q = query.toLowerCase();

    for (const line of lines) {
      if (line.toLowerCase().includes(q)) {
        return line.trim();
      }
    }

    return lines[0]?.trim() ?? content.slice(0, 100);
  }
}
