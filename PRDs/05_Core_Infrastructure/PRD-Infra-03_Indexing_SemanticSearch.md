# PRD-Infra-03: Indexing & Semantic Search (인덱싱 & 의미 검색)

> **Category**: Core Infrastructure  
> **Phase**: C5~C7 (Plan 모드 이후, 대형 레포 지원)  
> **관련 PRD**: `PRD-08_Codebase_Indexing.md`, `PRD-07_Parallel_File_Search.md`, `PRD-Harness-09_Prefetch_Pattern.md`

---

## 1. Overview

### 목적
`@codebase` 멘션과 `codebase_search` 도구로 **의미 기반 검색(Semantic Search)**을 제공한다. 키워드 매칭(grep)을 넘어 **동의어, 추상 개념, 의도**로 코드를 찾는다.

### 비즈니스 가치
- **대형 레포 필수**: 10k+ 파일에서 grep 느리고 부정확
- **자연어 쿼리**: "결제 흐름 관련 코드 다 찾아줘" → 관련 파일 10개 순위 반환
- **에이전트 자율성**: 모델이 "어디를 볼지" 스스로 판단 가능

---

## 2. Functional Requirements

### 2.1 인덱싱 파이프라인
| 단계 | 구현 | 비고 |
|------|------|------|
| **파일 수집** | `vscode.workspace.findFiles` + `.gitignore` 존중 | 언어별 확장자 필터 |
| **청킹** | Tree-sitter 기반 심볼 단위 (함수/클래스/메서드) + 상위 스코프 컨텍스트 | 중첩 컨텍스트 포함 |
| **임베딩** | 로컬 모델 (BAAI/bge-small-en-v1.5, 384-dim) ONNX Runtime | CPU/GPU 모두 지원 |
| **벡터 저장** | sqlite-vec (SQLite 가상 테이블) 또는 LanceDB | 별도 서버 불필요, 파일 기반 |
| **증분 업데이트** | `FileSystemWatcher` → 변경 파일만 재임베딩 | 저장 후 < 2초 반영 |
| **메타데이터** | 파일 경로, 심볼 종류, 시그니처, 독스트링, 라인 범위 | 검색 결과 풍부화 |

### 2.2 검색 도구: `codebase_search`
```typescript
interface CodebaseSearchArgs {
  query: string;                    // 자연어 쿼리
  topK?: number;                    // 기본 10, 최대 50
  filter?: {
    language?: string;              // 'typescript', 'python' 등
    pathGlob?: string;              // 'src/auth/**'
    symbolType?: 'function' | 'class' | 'interface' | 'variable';
  };
  rerank?: boolean;                 // Cross-encoder 재랭킹 (기본 true)
}
```

**반환**:
```typescript
interface SearchResult {
  file: string;
  symbol: string;
  signature: string;           // 선언부
  snippet: string;             // 주변 코드 (5줄)
  score: number;               // 0~1 (높을수록 관련)
  lines: [number, number];     // 시작/끝 라인
}
```

### 2.3 @codebase 멘션 처리
- 채팅 입력에서 `@codebase` 감지 → `codebase_search` 자동 호출
- 결과 상위 5개 → 컨텍스트에 `investigated_context` 블록으로 주입

---

## 3. Technical Spec

### 3.1 청킹 전략 (`src/indexing/chunker.ts`)

```typescript
interface CodeChunk {
  id: string;                    // hash(filePath + symbol + startLine)
  filePath: string;
  language: string;
  symbolName: string;
  symbolKind: SymbolKind;        // Function, Class, Method, Interface, Variable...
  startLine: number;
  endLine: number;
  content: string;               // 원본 코드
  context: string;               // 상위 스코프 시그니처 (클래스/네임스페이스)
  docComment?: string;           // JSDoc/Docstring
  signature: string;             // 선언부만 (임베딩용)
}

// Tree-sitter 쿼리 예시 (TypeScript)
const TS_CHUNK_QUERY = `
  [
    (function_declaration name: (identifier) @name) @func
    (method_definition name: (property_identifier) @name) @method
    (class_declaration name: (type_identifier) @name) @class
    (interface_declaration name: (type_identifier) @name) @interface
    (variable_declarator name: (identifier) @name value: (arrow_function) @arrow) @var
  ]
`;

export async function chunkFile(filePath: string, content: string, language: string): Promise<CodeChunk[]> {
  const parser = getParser(language);
  const tree = parser.parse(content);
  const chunks: CodeChunk[] = [];
  
  // Tree-sitter 쿼리 실행
  const captures = query.captures(tree.rootNode);
  for (const capture of captures) {
    const node = capture.node;
    const symbolName = node.text;
    const symbolKind = mapCaptureToKind(capture.name);
    
    // 상위 스코프 컨텍스트 추출
    const context = getAncestorContext(node);
    
    chunks.push({
      id: hash(`${filePath}:${symbolName}:${node.startPosition.row}`),
      filePath,
      language,
      symbolName,
      symbolKind,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      content: content.slice(node.startIndex, node.endIndex),
      context,
      signature: extractSignature(node, content),
      docComment: extractDocComment(node, content),
    });
  }
  
  return chunks;
}
```

### 3.2 임베더 (`src/indexing/embedder.ts`)

```typescript
export class LocalEmbedder {
  private session: ort.InferenceSession;
  private tokenizer: Tokenizer;  // bert-tokenizer 또는 유사

  constructor() {
    // bge-small-en-v1.5 ONNX 모델 로드 (확장 패키지에 포함)
    this.session = await ort.InferenceSession.create('models/bge-small-en-v1.5.onnx');
    this.tokenizer = new BertTokenizer('models/tokenizer.json');
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const batches = chunk(texts, 32);  // 배치 크기 32
    const results: Float32Array[] = [];
    
    for (const batch of batches) {
      const encoded = this.tokenizer.encodeBatch(batch);
      const inputIds = new ort.Tensor('int64', batch.map(t => t.ids), [batch.length, maxLen]);
      const attentionMask = new ort.Tensor('int64', batch.map(t => t.attentionMask), [batch.length, maxLen]);
      
      const output = await this.session.run({ input_ids: inputIds, attention_mask: attentionMask });
      const embeddings = output.last_hidden_state.data;  // [batch, seq, 384]
      
      // Mean pooling
      for (let i = 0; i < batch.length; i++) {
        const emb = meanPool(embeddings.slice(i * seqLen * 384, (i+1) * seqLen * 384));
        results.push(emb);
      }
    }
    return results;
  }
}
```

### 3.3 벡터 DB 스키마 (sqlite-vec)

```sql
-- 가상 테이블 생성
CREATE VIRTUAL TABLE code_chunks USING vec0(
  embedding float[384],
  file_path TEXT,
  symbol_name TEXT,
  symbol_kind TEXT,
  start_line INTEGER,
  end_line INTEGER,
  content TEXT,
  signature TEXT
);

-- 메타데이터 테이블
CREATE TABLE chunk_metadata (
  id INTEGER PRIMARY KEY,
  file_hash TEXT,              -- 변경 감지용
  language TEXT,
  doc_comment TEXT,
  indexed_at INTEGER
);

-- 검색 쿼리
SELECT file_path, symbol_name, signature, content,
       vec_distance_cosine(embedding, ?) as score
FROM code_chunks
WHERE score < 0.3
ORDER BY score ASC
LIMIT ?;
```

### 3.4 증분 업데이트 (`src/indexing/watcher.ts`)

```typescript
export class IncrementalIndexer {
  private watcher: vscode.FileSystemWatcher;
  private queue: string[] = [];
  private processing = false;

  constructor(private embedder: LocalEmbedder, private db: VectorDB) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,py,go,rs,java,cpp,c,h}');
    this.watcher.onDidChange(uri => this.queueFile(uri.fsPath));
    this.watcher.onDidCreate(uri => this.queueFile(uri.fsPath));
    this.watcher.onDidDelete(uri => this.removeFile(uri.fsPath));
  }

  private async queueFile(filePath: string) {
    if (this.shouldIgnore(filePath)) return;
    this.queue.push(filePath);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const file = this.queue.shift()!;
      try {
        const content = await fs.readFile(file, 'utf-8');
        const chunks = await chunkFile(file, content, detectLanguage(file));
        const embeddings = await this.embedder.embed(chunks.map(c => c.signature + '\n' + c.content));
        
        await this.db.upsertChunks(file, chunks, embeddings);
      } catch (e) {
        console.error(`Indexing failed for ${file}:`, e);
      }
    }
    this.processing = false;
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Codebase Indexing & Semantic Search

  Scenario: Initial indexing on medium repo
    Given a workspace with 15,000 TypeScript files
    When user triggers "Reindex Workspace"
    Then indexing completes within 15 minutes (GPU) or 45 minutes (CPU)
    And vector DB contains ~200k chunks
    And status bar shows progress with ETA

  Scenario: Incremental update on file save
    Given indexing complete
    When user saves changes to src/auth.ts
    Then within 2 seconds, chunks for auth.ts re-embedded
    And search results reflect new code immediately

  Scenario: Natural language query returns relevant results
    Given indexed codebase with payment module
    When user asks "@codebase how does refund work?"
    Then codebase_search called with query "refund payment flow"
    And top 5 results include refund-related functions/classes
    And results show file, symbol, signature, snippet, score

  Scenario: Filter by language and path
    When user searches "database connection" with filter {language: "python", pathGlob: "src/db/**"}
    Then only Python files under src/db/ considered
    And results ranked by relevance within that scope

  Scenario: Incremental update handles delete
    Given file src/old.ts was indexed
    When user deletes src/old.ts
    Then chunks for old.ts removed from vector DB
    And search no longer returns its symbols

  Scenario: Privacy - no external calls
    Given indexing runs
    When embeddings generated
    Then no network requests to external APIs
    And all computation local (ONNX Runtime)
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-08_Codebase_Indexing.md` — 상세 구현 계획
- `PRD-07_Parallel_File_Search.md` — grep 하이브리드 검색
- BGE Embeddings: https://huggingface.co/BAAI/bge-small-en-v1.5
- sqlite-vec: https://github.com/asg017/sqlite-vec
- Tree-sitter: https://tree-sitter.github.io/tree-sitter/