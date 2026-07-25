/**
 * ChatSearch — 로컬 대화/아티팩트/diff 검색 인덱스 (C7-T15)
 */
import * as fs from 'fs';
import * as path from 'path';

export interface SearchIndexEntry {
  id: string;
  type: 'chat' | 'artifact' | 'diff';
  title: string;
  content: string;
  path: string;
  timestamp: number;
  tags: string[];
}

export class ChatSearchIndex {
  private entries: SearchIndexEntry[] = [];
  private indexDir: string;

  constructor(indexDir: string) {
    this.indexDir = indexDir;
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }
  }

  /**
   * Index a new entry
   */
  index(entry: SearchIndexEntry): void {
    // Update existing or add new
    const existingIdx = this.entries.findIndex(e => e.id === entry.id);
    if (existingIdx >= 0) {
      this.entries[existingIdx] = entry;
    } else {
      this.entries.push(entry);
    }

    this.persist(entry);
  }

  /**
   * Search all indexed content
   */
  search(query: string, options?: { type?: string; maxResults?: number }): SearchIndexEntry[] {
    const q = query.toLowerCase();
    const maxResults = options?.maxResults ?? 20;

    let results = this.entries.filter(e => {
      if (options?.type && e.type !== options.type) return false;

      return (
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      );
    });

    // Sort by relevance (title match > content match > tag match) then recency
    results.sort((a, b) => {
      const aScore = this.relevanceScore(a, q);
      const bScore = this.relevanceScore(b, q);
      if (aScore !== bScore) return bScore - aScore;
      return b.timestamp - a.timestamp;
    });

    return results.slice(0, maxResults);
  }

  /**
   * Index diff content
   */
  indexDiff(diffId: string, title: string, diffContent: string, filePath: string): void {
    this.index({
      id: diffId,
      type: 'diff',
      title,
      content: diffContent,
      path: filePath,
      timestamp: Date.now(),
      tags: ['diff']
    });
  }

  /**
   * Load all entries from disk
   */
  loadAll(): void {
    if (!fs.existsSync(this.indexDir)) return;

    const files = fs.readdirSync(this.indexDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.indexDir, file), 'utf-8');
        const entry = JSON.parse(data) as SearchIndexEntry;
        this.entries.push(entry);
      } catch { /* skip corrupted */ }
    }
  }

  /**
   * Get total indexed count
   */
  get count(): number {
    return this.entries.length;
  }

  private persist(entry: SearchIndexEntry): void {
    const filePath = path.join(this.indexDir, `${entry.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  private relevanceScore(entry: SearchIndexEntry, query: string): number {
    let score = 0;
    if (entry.title.toLowerCase().includes(query)) score += 10;
    if (entry.content.toLowerCase().includes(query)) score += 3;
    if (entry.tags.some(t => t.toLowerCase().includes(query))) score += 5;
    return score;
  }
}
