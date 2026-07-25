/**
 * SemanticSearch — 벡터 DB (선택) 또는 ripgrep으로 시작 (C7-T31)
 *
 * 임베딩이 없으면 ripgrep(grep)으로 fallback 유도
 */
import { CodebaseIndexer } from './CodebaseIndexer';

export interface SemanticSearchResult {
  filePath: string;
  line: number;
  content: string;
  score: number;
}

export class SemanticSearch {
  private indexer: CodebaseIndexer;
  private embeddingModel: string | null = null;

  constructor(indexer: CodebaseIndexer) {
    this.indexer = indexer;
  }

  /**
   * Set embedding model (if available)
   */
  setEmbeddingModel(model: string): void {
    this.embeddingModel = model;
  }

  /**
   * Search using embeddings or fallback to regex
   */
  search(query: string, maxResults: number = 20): { results: SemanticSearchResult[]; method: 'embedding' | 'grep' } {
    if (this.embeddingModel) {
      return {
        results: this.embeddingSearch(query, maxResults),
        method: 'embedding'
      };
    }

    // Fallback: use CodebaseIndexer grep-style search
    const chunks = this.indexer.search(query, maxResults);
    return {
      results: chunks.map(c => ({
        filePath: c.filePath,
        line: c.startLine,
        content: this.extractRelevantLine(c.content, query),
        score: 1.0
      })),
      method: 'grep'
    };
  }

  /**
   * Check if embedding model is available
   */
  hasEmbeddingModel(): boolean {
    return this.embeddingModel !== null;
  }

  /**
   * Get search suggestion when embeddings unavailable
   */
  getSearchSuggestion(): string {
    return 'Semantic search: embedding model not configured. Consider setting up an embedding model or use grep/codebase_search for exact matches.';
  }

  private embeddingSearch(_query: string, _maxResults: number): SemanticSearchResult[] {
    // Placeholder for when embedding model is configured
    // Would use vector DB (e.g., pgvector, Chroma, LanceDB) for similarity search
    return [];
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
