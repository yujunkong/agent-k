/**
 * Indexing barrel — CTX-006 Workspace index, CTX-007 Codebase index, CTX-008 Semantic search.
 */

export type { WorkspaceFs, WorkspaceTextFile } from './WorkspaceFs';
export { WorkspaceIndexer, type IndexEntry } from './WorkspaceIndexer';
export { CodebaseIndexer, type IndexedChunk } from './CodebaseIndexer';
export {
  SemanticSearch,
  rankByTfIdf,
  type SemanticSearchResult,
} from './SemanticSearch';
