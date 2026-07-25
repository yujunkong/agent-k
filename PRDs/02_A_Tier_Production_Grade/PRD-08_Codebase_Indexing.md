# PRD-08: 코드베이스 인덱싱 + @codebase (Codebase Indexing)

> **Priority**: A급 (큰 레포에서 검색 품질 결정)  
> **Phase**: C5~C7 (Plan 모드 이후, 인프라 안정화 후)  
> **관련 PRD**: `PRD-Infra-03_Indexing_SemanticSearch.md`, `PRD-07_Parallel_File_Search.md`, `PRD-Tools-A_Search_Explore.md`

---

## 1. Overview

### 목적
**의미 기반 검색(Semantic Search)**을 위해 코드베이스를 청크→임베딩→벡터DB에 인덱싱한다. `@codebase` 멘션이나 `codebase_search` 도구로 "로그인 관련 코드 찾아줘" 같은 자연어 쿼리에 정확한 파일/심볼을 반환한다.

### 비즈니스 가치
- **grep 한계 극복**: 키워드 매칭 → 의미 매칭 (동의어, 추상 개념)
- **대형 레포 필수**: 10k+ 파일에서 grep 느리고 부정확
- **에이전트 자율성**: 모델이 "어디를 볼지" 스스로 판단 가능

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "결제 흐름 관련 코드 다 찾아줘"라고 하면 관련 파일 10개를 순위대로 받고 싶다 |
| US-02 | 개발자로서, 인덱싱이 백그라운드에서 자동으로 돌고, 변경 시 증분 업데이트되길 원한다 |
| US-03 | 팀 리더로서, 임베딩 모델을 로컬(BAAI/bge-small-en)로 돌려 비용·프라이버시 해결하고 싶다 |

---

## 2. Functional Requirements

### 2.1 인덱싱 파이프라인
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 언어별 파서 | Tree-sitter 기반: TS/JS, Python, Go, Rust, Java, C/C++ 등 |
| FR-02 | 청킹 전략 | 심볼 단위(함수/클래스/메서드) + 중첩 컨텍스트(상위 스코프 포함) |
| FR-03 | 임베딩 생성 | 로컬 임베딩 모델 (BAAI/bge-small-en-v1.5, 384-dim, CPU/GPU) |
| FR-04 | 벡터 저장소 | 로컬 SQLite + sqlite-vec 또는 LanceDB (파일 기반, 별도 서버 불필요) |
| FR-05 | 증분 업데이트 | 파일 변경 감시 (`FileSystemWatcher`) → 해당 파일만 재임베딩 |
| FR-06 | .gitignore 존중 | 기본 제외 + 사용자 설정 `agentK.indexing.excludeGlobs` |
| FR-07 | 인덱싱 진행 UI | 상태바 프로그레스 + "인덱싱 중..." 툴팁, 일시정지/재개 버튼 |
| FR-08 | 수동 트리거 | 명령 "Agent K: Reindex Workspace" |

### 2.2 검색 도구: `codebase_search`
```typescript
interface CodebaseSearchArgs {
  query: string;                    // 자연어 쿼리
  topK?: number;                    // 기본 10, 최대 50
  filter?: {                        // 선택적 필터
    language?: string;
    pathGlob?: string;
    symbolType?: 'function' | 'class' | 'interface' | 'variable';
  };
  rerank?: boolean;                 // Cross-encoder 재랭킹 (기본 true)
}
```
- 반환: `{ file, symbol, signature, snippet, score, lines: [start, end] }[]`

### 2.3 @codebase 멘션 처리
- 채팅 입력에서 `@codebase` 감지 → `codebase_search` 도구 자동 호출 → 결과를 컨텍스트에 주입

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 초기 인덱싱 시간 | 50k 파일 기준 < 10분 (로컬 GPU), < 30분 (CPU) |
| NFR-02 | 증분 업데이트 지연 | 파일 저장 후 < 2초 내 반영 |
| NFR-03 | 검색 지연 (P99) | < 500ms (벡터 검색 + 재랭킹) |
| NFR-04 | 디스크 사용량 | 50k 파일 기준 < 2GB (임베딩 + 인덱스) |
| NFR-05 | 메모리 사용량 | 인덱싱 프로세스 < 4GB (스트리밍 처리) |
| NFR-06 | 프라이버시 | 코드가 워크스페이스 밖으로 나가지 않음 (로컬 임베딩) |

---

## 4. API & Technical Spec

### 4.1 아키텍처 구성도
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ File Watcher │────▶│  Chunker    │────▶│  Embedder   │────▶│ Vector DB   │
│ (FSWatcher)  │     │ (Tree-sitter)│    │ (bge-small) │     │ (sqlite-vec)│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                                        │
                           ▼                                        ▼
                    ┌─────────────┐                         ┌─────────────┐
                    │ Symbol Map  │                         │ Search API  │
                    │ (LSIF-like) │◀────────────────────────│ (codebase_  │
                    └─────────────┘                         │  search)    │
                                                            └─────────────┘
```

### 4.2 청킹 전략 (`src/indexing/chunker.ts`)

```typescript
interface CodeChunk {
  id: string;                    // hash(filePath + symbol + startLine)
  filePath: string;
  language: string;
  symbolName: string;            // 함수/클래스명
  symbolKind: SymbolKind;        // Function, Class, Method, Interface...
  startLine: number;
  endLine: number;
  content: string;               // 원본 코드
  context: string;               // 상위 스코프(클래스/네임스페이스) 시그니처
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
  ]
`;
```

### 4.3 임베딩 생성 (`src/indexing/embedder.ts`)

```typescript
export class LocalEmbedder {
  private session: ort.InferenceSession;  // ONNX Runtime Web/Node
  
  async embed(texts: string[]): Promise<Float32Array[]> {
    // 배치 처리: 32개씩
    const batches = chunk(texts, 32);
    const results: Float32Array[] = [];
    
    for (const batch of batches) {
      const tokens = this.tokenizer.encodeBatch(batch);
      const inputIds = new ort.Tensor('int64', tokens.ids, [batch.length, maxLen]);
      const attentionMask = new ort.Tensor('int64', tokens.attentionMask, [batch.length, maxLen]);
      
      const output = await this.session.run({ input_ids: inputIds, attention_mask: attentionMask });
      const embeddings = output.last_hidden_state.data;  // [batch, seq, 384]
      
      // Mean pooling
      for (let i = 0; i < batch.length; i++) {
        results.push(meanPool(embeddings.slice(i * seqLen * 384, (i+1) * seqLen * 384)));
      }
    }
    return results;
  }
}
```

### 4.4 벡터 DB 스키마 (sqlite-vec)

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
  file_hash TEXT,           -- 변경 감지용
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

### 4.5 재랭킹 (Cross-Encoder, 선택적)
- `bge-reranker-base` ONNX 모델로 Top-50 → Top-10 정밀 재정렬
- GPU 없을 때 생략 가능 (설정 `agentK.indexing.rerank: false`)

---

## 5. UI/UX Specification

### 5.1 인덱싱 상태바
```
$(database) Indexing: 23,451 / 45,200 files (52%)  ETA: 3m  [⏸ Pause]
```
- 클릭 → 상세 패널 (파일별 진행, 에러 로그, 일시정지/재개/취소)

### 5.2 검색 결과 패널 (채팅 내 인라인 또는 사이드 패널)
```
@codebase "payment processing"

🔍 Found 12 results (0.3s)
┌─────────────────────────────────────────────────────────────┐
│ 1. src/payment/processor.ts:45  processPayment()  ████████ 0.92
│    export async function processPayment(order: Order) { ...  │
├─────────────────────────────────────────────────────────────┤
│ 2. src/payment/gateway/stripe.ts:12  charge()       ████████ 0.89
│    export async function charge(token: string, amt: number) │
├─────────────────────────────────────────────────────────────┤
│ 3. src/order/service.ts:78  handlePayment()       ████████ 0.87
│    private async handlePayment(orderId: string) { ...       │
└─────────────────────────────────────────────────────────────┘
[Add to Context]  [Open File]  [Refine Query]
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Codebase Indexing and Semantic Search

  Scenario: Initial indexing on medium repo
    Given a workspace with 15,000 TypeScript files
    When user triggers "Reindex Workspace"
    Then indexing completes within 15 minutes (GPU) or 45 minutes (CPU)
    And status bar shows progress with ETA
    And vector DB contains ~200k chunks

  Scenario: Incremental update on file save
    Given indexing is complete
    When user saves changes to src/auth.ts
    Then within 2 seconds, chunks for auth.ts are re-embedded
    And search results reflect new code immediately

  Scenario: Natural language search via @codebase
    Given user types "@codebase how does password reset work?"
    When message is sent
    Then codebase_search tool is called automatically
    And top 5 relevant files (auth, email, token) are injected into context
    And model answers with references to those files

  Scenario: Search tool returns ranked results
    Given agent calls codebase_search({query: "user authentication flow", topK: 10})
    Then results include symbol names, signatures, and snippets
    And scores are normalized 0-1 (higher = more relevant)
    And results respect language/path filters if provided

  Scenario: Privacy - no external calls
    Given indexing runs
    Then no network requests to external embedding APIs
    And all embeddings computed locally via ONNX Runtime
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-03_Indexing_SemanticSearch.md` | 상위 | 인프라 레벨 스펙 |
| `PRD-07_Parallel_File_Search.md` | 병행 | grep 하이브리드 검색 (키워드+의미) |
| `PRD-Tools-A_Search_Explore.md` | 상위 | `codebase_search` 도구 정의 |
| `@xenova/transformers` 또는 `onnxruntime-node` | 런타임 | 로컬 임베딩 (Apache 2.0) |
| `sqlite-vec` 또는 `lancedb` | 런타임 | 벡터 DB (MIT/Apache 2.0) |
| `tree-sitter` + 언어별 그래머 | 런타임 | 파싱 (MIT) |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | Tree-sitter 파서 통합 + 청커 (TS/JS, Python, Go) | 청크 단위 테스트 통과 |
| 2 | ONNX 임베더 + 배치 처리 + sqlite-vec 스키마 | 1k 파일 인덱싱 E2E |
| 3 | FileSystemWatcher 증분 업데이트 + 해시 기반 변경 감지 | 저장 시 2초 내 반영 |
| 4 | `codebase_search` 도구 + 재랭킹 옵션 | 검색 품질 벤치마크 (Recall@10 > 0.8) |
| 5 | @codebase 멘션 핸들러 + 채팅 컨텍스트 주입 | 자연어 쿼리 E2E |
| 6 | 상태바 UI + 진행률/일시정지/에러 패널 | 사용자 가시성 확보 |
| 7 | 설정: 제외 글로브, 임베딩 모델 선택, 재랭킹 on/off | 엔터프라이즈 커스터마이징 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 초기 인덱싱 시간 과다 (대형 레포) | 높음 | 백그라운드 저우선순위, 진행률 UI, 부분 인덱싱(폴더별) 옵션 |
| Tree-sitter 그래머 버전 불일치 | 중간 | 그래머 버전 고정(pin), 파싱 실패 시 정규식 폴백 |
| 임베딩 모델 품질 낮음 (소형 모델) | 중간 | bge-small-en-v1.5 검증됨, 필요시 bge-base (768-dim) 옵션 |
| 벡터 DB 동시성 (읽기/쓰기 경합) | 중간 | sqlite-vec는 읽기 전용 트랜잭션 다중 지원, 쓰기는 단일 큐 |
| 디스크 공간 부족 | 낮음 | 인덱싱 전 공간 체크, 압축 옵션(양자화), 자동 정리 정책 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: 코드베이스 인덱싱 + @codebase**
- BGE 임베딩: https://huggingface.co/BAAI/bge-small-en-v1.5
- sqlite-vec: https://github.com/asg017/sqlite-vec
- Tree-sitter: https://tree-sitter.github.io/tree-sitter/
- LSIF 사양: https://github.com/microsoft/lsif