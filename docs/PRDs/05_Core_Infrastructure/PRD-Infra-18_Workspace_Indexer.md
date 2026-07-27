# PRD-Infra-18: Workspace Indexer (워크스페이스 인덱서)

> **Category**: Core Infrastructure  
> **Priority**: P0 (A-Tier 기능의 기반)  
> **Phase**: C2 (Agent 1-turn에서 파일 탐색 필요) → C4 (완전체)  
> **관련 PRD**: `PRD-08_Codebase_Indexing.md`, `PRD-Infra-03_Indexing_SemanticSearch.md`, `PRD-Harness-09_Prefetch_Pattern.md`

---

## 1. Overview

### 목적
워크스페이스 코드베이스를 **증분 인덱싱**하여: 심볼 정의/참조 검색, 시맨틱 코드 검색, 파일 중요도 랭킹을 **로컬/온디바이스**로 제공.

### 핵심 요구사항
| 요구사항 | 목표 |
|----------|------|
| **증분 업데이트** | 파일 변경 시 < 500ms 내 인덱스 반영 |
| **로컬 실행** | 네트워크 없이 임베딩/검색 동작 (ONNX/WebAssembly) |
| **언어 중립** | Tree-sitter 기반 20+ 언어 지원 |
| **메모리 효율** | 100K 파일 워크스페이스 < 500MB RAM |
| **프리패치 연동** | 인덱스 샤드 프리패치로 검색 지연 0 근접 |

---

## 2. Architecture

### 2.1 인덱싱 파이프라인

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORKSPACE INDEXER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  File Watcher (VS Code)                                          │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  CHANGE DETECTOR │───▶│  INCREMENTAL     │                   │
│  │  (git + fs watch)│    │  UPDATER         │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                             │
│               ┌───────────────────┼───────────────────┐         │
│               ▼                   ▼                   ▼         │
│        ┌──────────┐         ┌──────────┐         ┌──────────┐  │
│        │ SYMBOL   │         │ SEMANTIC │         │ FILE     │  │
│        │ INDEX    │         │ INDEX    │         │ METADATA │  │
│        │ (LSIF)   │         │ (Vector) │         │ (Size,   │  │
│        │          │         │          │         │  imports)│  │
│        └──────────┘         └──────────┘         └──────────┘  │
│               │                   │                   │         │
│               └───────────────────┼───────────────────┘         │
│                                   ▼                             │
│                        ┌──────────────────────┐                 │
│                        │   QUERY ENGINE       │                 │
│                        │  (Symbol + Vector +  │                 │
│                        │   Graph Hybrid)      │                 │
│                        └──────────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 데이터 구조

```typescript
// src/indexer/types.ts

// 심볼 인덱스 (Language Server Index Format 기반)
export interface SymbolIndex {
  symbols: Map<string, SymbolEntry>;      // 심볼명 → 진입점
  references: Map<string, ReferenceEntry[]>; // 심볼 → 참조 위치들
  definitions: Map<string, DefinitionEntry>; // 심볼 → 정의 위치
  fileSymbols: Map<string, string[]>;     // 파일 → 포함 심볼들
}

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;          // function, class, interface, variable, etc.
  signature?: string;        // 타입 시그니처
  filePath: string;
  range: Range;              // 정의 위치
  documentation?: string;    // JSDoc/docstring
  language: string;
}

// 시맨틱 인덱스 (벡터 임베딩)
export interface SemanticIndex {
  shards: Map<string, VectorShard>;  // 샤드 키 → 벡터 샤드
  metadata: Map<string, ChunkMetadata>; // 청크 ID → 메타데이터
}

export interface VectorShard {
  id: string;
  vectors: Float32Array;       // [numChunks, embeddingDim]
  chunkIds: string[];          // 벡터 인덱스 → 청크 ID
  centroid: Float32Array;      // 클러스터 중심점 (ANN 검색용)
}

export interface ChunkMetadata {
  id: string;
  filePath: string;
  range: Range;
  content: string;             // 원본 텍스트 (압축 저장)
  symbols: string[];           // 포함된 심볼명
  language: string;
  importance: number;          // 0-1 (참조 횟수, 최근 수정 등)
}

// 파일 메타데이터
export interface FileMetadata {
  path: string;
  language: string;
  size: number;
  lines: number;
  imports: string[];           // import/require 문
  exports: string[];           // export 문
  symbols: string[];           // 정의된 심볼
  lastIndexed: number;
  hash: string;                // 변경 감지용
}
```

---

## 3. Incremental Update Engine

### 3.1 변경 감지

```typescript
// src/indexer/ChangeDetector.ts
export class ChangeDetector {
  constructor(
    private watcher: vscode.FileSystemWatcher,
    private git: GitInterface
  ) {}

  async detectChanges(): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    
    // 1. Git status (정확한 변경 파일)
    const gitChanges = await this.git.status();
    for (const change of gitChanges) {
      changes.push({
        path: change.path,
        type: change.type === 'deleted' ? 'delete' : 'modify',
        hash: await this.git.fileHash(change.path)
      });
    }

    // 2. FS Watcher로 실시간 변경 보완
    // (git이 무시하는 파일, 저장 전 변경 등)
    
    return changes;
  }
}
```

### 3.2 증분 업데이터

```typescript
// src/indexer/IncrementalUpdater.ts
export class IncrementalUpdater {
  constructor(
    private symbolIndex: SymbolIndex,
    private semanticIndex: SemanticIndex,
    private fileMetadata: Map<string, FileMetadata>,
    private parser: MultiLanguageParser,
    private embedder: LocalEmbedder
  ) {}

  async applyChanges(changes: FileChange[]): Promise<UpdateStats> {
    const stats = { added: 0, modified: 0, deleted: 0, errors: 0 };
    
    for (const change of changes) {
      try {
        switch (change.type) {
          case 'delete':
            await this.removeFile(change.path);
            stats.deleted++;
            break;
            
          case 'add':
          case 'modify':
            const isNew = !this.fileMetadata.has(change.path);
            await this.indexFile(change.path, change.hash);
            if (isNew) stats.added++; else stats.modified++;
            break;
        }
      } catch (err) {
        stats.errors++;
        console.error(`Index update failed for ${change.path}:`, err);
      }
    }
    
    // 샤드 재구성 필요 시 (너무 많은 변경)
    if (stats.modified > 1000) {
      await this.rebuildSemanticShards();
    }
    
    return stats;
  }

  private async indexFile(path: string, hash: string): Promise<void> {
    const content = await fs.readFile(path, 'utf8');
    const language = this.detectLanguage(path);
    const tree = this.parser.parse(content, language);
    
    // 1. 심볼 추출
    const symbols = this.parser.extractSymbols(tree, path);
    this.updateSymbolIndex(path, symbols);
    
    // 2. 청크 분할 & 임베딩
    const chunks = this.chunkContent(content, tree);
    const embeddings = await this.embedder.embedBatch(chunks.map(c => c.text));
    
    // 3. 시맨틱 인덱스 업데이트
    await this.updateSemanticIndex(path, chunks, embeddings);
    
    // 4. 파일 메타데이터 저장
    this.fileMetadata.set(path, {
      path, language, size: content.length,
      lines: content.split('\n').length,
      imports: this.extractImports(tree),
      exports: this.extractExports(tree),
      symbols: symbols.map(s => s.name),
      lastIndexed: Date.now(),
      hash
    });
  }
}
```

---

## 4. Local Embedding (ONNX Runtime)

### 4.1 임베더 인터페이스

```typescript
// src/indexer/LocalEmbedder.ts
export interface LocalEmbedder {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;  // [n, dim]
  getDimension(): number;
  getModelName(): string;
}

export class ONNXEmbedder implements LocalEmbedder {
  private session: ort.InferenceSession;
  private tokenizer: Tokenizer;
  private readonly maxLength = 512;
  
  async initialize(modelPath: string): Promise<void> {
    // ONNX Runtime Web (WASM) 또는 Node 바인딩
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['wasm']  // 브라우저/Node 공통
    });
    this.tokenizer = await Tokenizer.fromFile(path.join(modelPath, 'tokenizer.json'));
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const encoded = texts.map(t => this.tokenizer.encode(t, this.maxLength));
    const inputIds = new ort.Tensor('int64', 
      new BigInt64Array(encoded.flatMap(e => e.ids)), 
      [texts.length, this.maxLength]
    );
    const attentionMask = new ort.Tensor('int64',
      new BigInt64Array(encoded.flatMap(e => e.attentionMask)),
      [texts.length, this.maxLength]
    );
    
    const results = await this.session.run({ input_ids: inputIds, attention_mask: attentionMask });
    const embeddings = results.last_hidden_state as ort.Tensor;
    
    // Mean pooling
    return this.meanPool(embeddings, attentionMask);
  }
}
```

### 4.2 모델 선택 가이드

| 모델 | 차원 | 크기 | 속도 (CPU) | 품질 | 용도 |
|------|------|------|------------|------|------|
| **all-MiniLM-L6-v2** | 384 | 22MB | ~5ms/text | 좋음 | 기본값 |
| **bge-small-en-v1.5** | 384 | 33MB | ~8ms/text | 매우 좋음 | 고품질 |
| **e5-small-v2** | 384 | 48MB | ~10ms/text | 최상 | 다국어 |
| **jina-embeddings-v2-small** | 512 | 60MB | ~15ms/text | 최상 | 긴 컨텍스트 |

---

## 5. Query Engine (하이브리드 검색)

```typescript
// src/indexer/QueryEngine.ts
export class QueryEngine {
  constructor(
    private symbolIndex: SymbolIndex,
    private semanticIndex: SemanticIndex,
    private fileMetadata: Map<string, FileMetadata>
  ) {}

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // 1. 심볼 정확 매칭 (최우선)
    if (query.type === 'symbol' || query.type === 'hybrid') {
      const symbolResults = this.searchSymbols(query.text);
      results.push(...symbolResults.map(r => ({ ...r, source: 'symbol', score: r.score * 1.5 })));
    }
    
    // 2. 시맨틱 벡터 검색
    if (query.type === 'semantic' || query.type === 'hybrid') {
      const vectorResults = await this.searchSemantic(query.text, query.topK);
      results.push(...vectorResults.map(r => ({ ...r, source: 'semantic' })));
    }
    
    // 3. 파일 메타데이터 기반 랭킹 부스트
    const boosted = this.boostByMetadata(results, query);
    
    // 4. 중복 제거 & 정렬
    return this.deduplicateAndRank(boosted, query.topK);
  }

  private searchSymbols(text: string): SearchResult[] {
    // 퍼지 매칭: 함수명, 클래스명, 변수명
    const matches = fuzzyMatch(text, Array.from(this.symbolIndex.symbols.keys()));
    return matches.map(m => ({
      type: 'symbol',
      symbol: this.symbolIndex.symbols.get(m.key)!,
      score: m.score
    }));
  }

  private async searchSemantic(text: string, topK: number): Promise<SearchResult[]> {
    const queryVec = await this.embedder.embed(text);
    const results: SearchResult[] = [];
    
    // 샤드별 ANN 검색 (FAISS 스타일 단순 구현)
    for (const [shardId, shard] of this.semanticIndex.shards) {
      const similarities = this.cosineSimilarity(queryVec, shard.vectors);
      const topIndices = this.topKIndices(similarities, Math.min(topK, 50));
      
      for (const idx of topIndices) {
        const chunkId = shard.chunkIds[idx];
        const meta = this.semanticIndex.metadata.get(chunkId)!;
        results.push({
          type: 'semantic',
          chunk: meta,
          score: similarities[idx]
        });
      }
    }
    
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
```

---

## 6. Prefetch Integration

```typescript
// src/indexer/PrefetchIntegration.ts
export class IndexPrefetcher {
  constructor(
    private indexer: WorkspaceIndexer,
    private cache: PrefetchCache
  ) {}

  // 다음 턴에 필요할 샤드 예측 및 프리패치
  async predictAndPrefetch(context: PrefetchContext): Promise<void> {
    const predictions = this.predictShards(context);
    
    for (const shardKey of predictions) {
      if (!this.cache.has(shardKey)) {
        const shard = await this.indexer.getShard(shardKey);
        this.cache.set(shardKey, shard);
      }
    }
  }

  private predictShards(context: PrefetchContext): string[] {
    const shards = new Set<string>();
    
    // 1. 활성 파일의 임포트/참조 파일들
    for (const file of context.activeFiles) {
      const meta = this.indexer.getFileMetadata(file);
      for (const imp of meta.imports) {
        shards.add(this.getShardForFile(imp));
      }
    }
    
    // 2. 최근 검색 쿼리 키워드 기반
    for (const query of context.recentQueries) {
      shards.add(this.getShardForQuery(query));
    }
    
    // 3. 현재 목표(플랜) 키워드
    for (const kw of this.extractKeywords(context.currentGoal)) {
      shards.add(this.getShardForQuery(kw));
    }
    
    return Array.from(shards).slice(0, 10); // 최대 10 샤드
  }
}
```

---

## 7. Acceptance Criteria

```gherkin
Feature: Workspace Indexer

  Scenario: Incremental update on file save
    Given a TypeScript file "src/auth.ts" with 3 functions
    When user saves the file after adding a 4th function
    Then symbol index updated within 500ms
    And new function appears in symbol search
    And semantic index updated for changed chunks only

  Scenario: Symbol search finds definitions
    Given workspace indexed
    When user searches "class UserService"
    Then exact matches ranked first
    And definition location (file, line) returned
    And references count shown

  Scenario: Semantic search finds relevant code
    Given codebase with "authentication" related code
    When user searches "how to validate JWT token"
    Then relevant files ranked by semantic similarity
    And results include code snippets with highlights

  Scenario: Large workspace memory within budget
    Given 100,000 files workspace
    When indexer runs
    Then memory usage < 500MB
    And initial index < 5 minutes
    And incremental updates < 1 second

  Scenario: Prefetch eliminates search latency
    Given user reading "src/api/auth.ts"
    When prefetch runs
    Then related shards cached
    And subsequent search for "auth" returns in < 10ms

  Scenario: Language agnostic indexing
    Given Python, Go, Rust files in workspace
    When indexer runs
    Then symbols extracted for all languages
    And semantic search works across languages
```

---

## 8. Configuration

```json
// package.json contributes.configuration
{
  "agent-k.indexing.enabled": true,
  "agent-k.indexing.maxFileSize": 100000,      // 100KB 이상 파일 스킵
  "agent-k.indexing.excludePatterns": [
    "**/node_modules/**", "**/dist/**", "**/build/**",
    "**/*.min.js", "**/*.map", "**/coverage/**"
  ],
  "agent-k.indexing.embeddingModel": "all-MiniLM-L6-v2",
  "agent-k.indexing.maxMemoryMB": 500,
  "agent-k.indexing.prefetchEnabled": true,
  "agent-k.indexing.watchEnabled": true
}
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 9. References

- `PRD-08_Codebase_Indexing.md` — A-Tier 기능 명세 (사용자 관점)
- `PRD-Infra-03_Indexing_SemanticSearch.md` — 인덱싱 인프라 상세
- `PRD-Harness-09_Prefetch_Pattern.md` — 프리패치 연동
- LSIF Specification: https://github.com/microsoft/lsif
- ONNX Runtime Web: https://onnxruntime.ai/docs/api/js/