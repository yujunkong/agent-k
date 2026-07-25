# PRD-16: 대화 검색 · 아티팩트 (Chat Search & Artifacts)

> **Priority**: A급 (긴 이력에서 회수)  
> **Phase**: C7  
> **관련 PRD**: `PRD-Infra-10_Context_Compaction.md`, `PRD-15_Memories.md`, `PRD-01_Sidebar_Chat_BYOLLM.md`

---

## 1. Overview

### 목적
긴 채팅 세션에서 **과거 대화·데모·Diff 카드**를 검색·재사용한다. 로컬 인덱스(제목+요약+임베딩)로 빠른 검색, 아티팩트(스크린샷, Diff, 코드 블록)는 카드 형태로 사이드바에 고정·재방문.

### 비즈니스 가치
- "어제 그 버그 어떻게 고쳤더라?" → 1초 검색
- 설계 논의·아키텍처 다이어그램(Mermaid) 영구 보관
- 온보딩 새 멤버에게 과거 결정 맥락 공유

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "로그인 리팩터링" 검색하면 관련 대화·Diff·파일 목록이 뜨고 클릭 시 컨텍스트 복원되길 원한다 |
| US-02 | 개발자로서, 중요한 Diff·스크린샷·코드 블록을 "아티팩트"로 핀 고정해 나중에 바로 보고 싶다 |
| US-03 | 팀 리더로서, 주요 결정(아키텍처, 라이브러리 선택) 대화만 모아 문서화하고 싶다 |

---

## 2. Functional Requirements

### 2.1 대화 인덱싱
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 자동 인덱싱 | 각 턴 종료 시: 사용자 메시지 + 모델 응답 요약(첫 200자) + 툴 결과 요약 → 로컬 DB |
| FR-02 | 임베딩 생성 | 미니 임베딩 모델(all-MiniLM-L6-v2, 384-d)로 벡터화, sqlite-vec 저장 |
| FR-03 | 메타데이터 | `sessionId`, `turnIndex`, `timestamp`, `mode`, `filesTouched[]`, `toolsUsed[]` |
| FR-04 | 증분 업데이트 | 새 턴만 임베딩, 기존 불변 |

### 2.2 검색 인터페이스
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 검색 명령 | `/search <query>` 또는 사이드바 검색창 |
| FR-06 | 하이브리드 검색 | 키워드(BM25) + 의미(벡터) → RRF(Rank Fusion) 합산 |
| FR-07 | 필터 | 모드(Ask/Agent/Plan/Debug), 날짜 범위, 파일 경로, 툴 종류 |
| FR-08 | 결과 프리뷰 | 매칭 턴 요약 + 하이라이트 + [열기] [컨텍스트 복원] 버튼 |

### 2.3 아티팩트 시스템
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-09 | 아티팩트 타입 | `diff_card`, `screenshot`, `code_block`, `mermaid_diagram`, `test_report`, `file_snapshot` |
| FR-10 | 생성 트리거 | 모델 응답 내 `<artifact type="diff_card" id="...">` 블록 또는 도구 결과 메타데이터 |
| FR-11 | 사이드바 패널 | 아티팩트 목록 (타입 아이콘, 제목, 타임스탬프, 세션 링크) |
| FR-12 | 상세 뷰 | 클릭 시 전체 내용 렌더링 (DiffEditor, 이미지 뷰어, Mermaid 렌더러) |
| FR-13 | 핀/언핀 | 중요 아티팩트 상단 고정 |
| FR-14 | 내보내기 | 마크다운/HTML/PDF로 아티팩트 묶음 내보내기 |

### 2.4 컨텍스트 복원
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-15 | "이 대화로 계속" | 검색 결과에서 선택 → 해당 턴부터 새 세션 시작 (히스토리 포함 옵션) |
| FR-16 | 아티팩트 주입 | 현재 세션에 아티팩트 내용 컨텍스트로 주입 (`@artifact:diff-card-123`) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 검색 지연 (P99) | < 300ms (로컬 sqlite-vec + BM25) |
| NFR-02 | 인덱싱 오버헤드 | 턴당 < 50ms (임베딩 배치 처리) |
| NFR-03 | 저장 용량 | 세션당 ~1MB, 전체 < 500MB (자동 정리 정책) |
| NFR-04 | 프라이버시 | 임베딩/검색 완전 로컬, 외부 전송 없음 |

---

## 4. API & Technical Spec

### 4.1 데이터베이스 스키마 (sqlite-vec)

```sql
-- 대화 턴
CREATE TABLE chat_turns (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  mode TEXT NOT NULL,           -- ask|agent|plan|debug
  user_msg TEXT NOT NULL,
  assistant_msg TEXT NOT NULL,  -- 요약본(200자)
  tools_used TEXT,              -- JSON array
  files_touched TEXT,           -- JSON array
  summary_embedding BLOB        -- 384-dim float32
);

-- 아티팩트
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,          -- uuid
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  type TEXT NOT NULL,           -- diff_card|screenshot|code_block|mermaid|test_report|file_snapshot
  title TEXT NOT NULL,
  content TEXT NOT NULL,        -- 본문 (diff, base64 img, code, mermaid, json)
  metadata TEXT,                -- JSON (language, filename, etc.)
  pinned INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 가상 테이블로 벡터 인덱스
CREATE VIRTUAL TABLE turns_vec USING vec0(
  embedding float[384]
);
```

### 4.2 검색 엔진 (`src/search/chatSearch.ts`)

```typescript
export class ChatSearchEngine {
  private db: Database;
  private embedder: LocalEmbedder;  // all-MiniLM-L6-v2 ONNX
  private bm25: BM25Index;          // 키워드 인덱스

  async indexTurn(turn: ChatTurn): Promise<void> {
    // 1. 요약 생성 (모델 또는 휴리스틱)
    const summary = this.summarizeTurn(turn);
    
    // 2. 임베딩
    const embedding = await this.embedder.embed(summary);
    
    // 3. DB 저장
    const stmt = this.db.prepare(`
      INSERT INTO chat_turns (session_id, turn_index, timestamp, mode, user_msg, assistant_msg, tools_used, files_touched, summary_embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(turn.sessionId, turn.index, turn.timestamp, turn.mode, 
      turn.userMsg, summary, JSON.stringify(turn.tools), JSON.stringify(turn.files), embedding);
    
    // 4. 벡터 인덱스 추가
    this.db.prepare('INSERT INTO turns_vec(rowid, embedding) VALUES (?, ?)').run(info.lastInsertRowid, embedding);
    
    // 5. BM25 인덱스 업데이트 (배치로 모아서 주기적)
    this.bm25Queue.push({ id: info.lastInsertRowid, text: turn.userMsg + ' ' + summary });
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { mode, dateFrom, dateTo, filePath, toolName, limit = 20 } = options;
    
    // 1. 쿼리 임베딩
    const queryVec = await this.embedder.embed(query);
    
    // 2. 벡터 검색 (sqlite-vec)
    const vecResults = this.db.prepare(`
      SELECT rowid, distance FROM turns_vec 
      WHERE embedding MATCH ? AND k = ?
    `).all(queryVec, limit * 3);  // 넉넉히 가져와 BM25와 퓨전
    
    // 3. BM25 검색
    const bm25Results = this.bm25.search(query, limit * 3);
    
    // 4. RRF (Reciprocal Rank Fusion)
    const fused = this.rrfFuse(vecResults, bm25Results, 60);
    
    // 5. 메타데이터 조인 + 필터
    const placeholders = fused.map(() => '?').join(',');
    let sql = `SELECT * FROM chat_turns WHERE rowid IN (${placeholders})`;
    const params = fused.map(r => r.rowid);
    
    if (mode) { sql += ` AND mode = ?`; params.push(mode); }
    if (dateFrom) { sql += ` AND timestamp >= ?`; params.push(dateFrom); }
    if (dateTo) { sql += ` AND timestamp <= ?`; params.push(dateTo); }
    if (filePath) { sql += ` AND files_touched LIKE ?`; params.push(`%${filePath}%`); }
    if (toolName) { sql += ` AND tools_used LIKE ?`; params.push(`%${toolName}%`); }
    
    sql += ` ORDER BY CASE rowid ` + fused.map((r, i) => `WHEN ${r.rowid} THEN ${i}`).join(' ') + ` END LIMIT ?`;
    params.push(limit);
    
    const rows = this.db.prepare(sql).all(...params) as ChatTurnRow[];
    
    return rows.map(row => ({
      turn: this.rowToTurn(row),
      score: fused.find(f => f.rowid === row.rowid)?.score || 0,
      highlights: this.highlight(row, query),
    }));
  }

  private rrfFuse(vec: VecResult[], bm25: BM25Result[], k = 60): FusedResult[] {
    const scores = new Map<number, number>();
    for (const [i, r] of vec.entries()) scores.set(r.rowid, (scores.get(r.rowid) || 0) + 1 / (k + i + 1));
    for (const [i, r] of bm25.entries()) scores.set(r.rowid, (scores.get(r.rowid) || 0) + 1 / (k + i + 1));
    return Array.from(scores.entries())
      .map(([rowid, score]) => ({ rowid, score }))
      .sort((a, b) => b.score - a.score);
  }
}
```

### 4.3 아티팩트 추출기 (`src/artifacts/extractor.ts`)

```typescript
// 모델 응답에서 아티팩트 블록 파싱
export function extractArtifacts(text: string, sessionId: string, turnIndex: number): Artifact[] {
  const artifacts: Artifact[] = [];
  
  // 1. 명시적 아티팩트 블록: <artifact type="diff_card" id="...">...</artifact>
  const blockRegex = /<artifact\s+type="(\w+)"\s+id="([^"]+)"(?:\s+title="([^"]*)")?>([\s\S]*?)<\/artifact>/g;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    artifacts.push({
      id: match[2],
      type: match[1] as ArtifactType,
      title: match[3] || `Artifact ${match[2].slice(0,8)}`,
      content: match[4].trim(),
      sessionId,
      turnIndex,
      metadata: {},
    });
  }
  
  // 2. 도구 결과에서 자동 생성 (edit_file → diff_card, browser_screenshot → screenshot)
  // → ToolExecutor 후킹으로 처리 (별도)
  
  return artifacts;
}
```

---

## 5. UI/UX Specification

### 5.1 검색 사이드바
```
┌─ Chat Search ────────────────────────────────────────────────────────┐
│  [🔍 Search conversations...          ]  [Filters ▼]                 │
├────────────────────────────────────────────────────────────────────────┤
│  Results for "auth refactor" (12 matches)                            │
├────────────────────────────────────────────────────────────────────────┤
│ 🟢 Agent  •  2h ago  •  src/auth/*.ts                                │
│   "Refactored UserService to Strategy pattern..."                    │
│   [Open] [Restore Context]  📎 3 artifacts                          │
├────────────────────────────────────────────────────────────────────────┤
│ 🔵 Plan   •  1d ago  •  ARCHITECTURE.md                              │
│   "Planned auth migration: interfaces, providers, tests..."          │
│   [Open] [Restore Context]                                           │
├────────────────────────────────────────────────────────────────────────┤
│ 🟡 Debug  •  3d ago  •  tests/auth.test.ts                           │
│   "Fixed flaky test: mock token expiry..."                           │
│   [Open] [Restore Context]  📎 1 artifact                           │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 아티팩트 패널
```
┌─ Artifacts ──────────────────────────────────────────────────────────┐
│  [📌 Pinned]                                    [Filter: All ▼]       │
├────────────────────────────────────────────────────────────────────────┤
│ 📌 🎨 diff_card     "UserService Strategy Refactor"   2h ago  [🔗]   │
│    🖼 screenshot    "Login Page Before/After"         2h ago          │
│    📝 code_block    "New AuthStrategy Interface"      2h ago          │
│    📊 test_report   "Auth Tests: 12/12 passed"        2h ago          │
│    🧜 mermaid       "Auth Flow Diagram"               1d ago          │
├────────────────────────────────────────────────────────────────────────┤
│  [Export Selected as Markdown]  [Clear Unpinned > 30 days]           │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.3 아티팩트 상세 뷰 (클릭 시)
```
┌─ Artifact: UserService Strategy Refactor (diff_card) ────────────────┐
│  Session: abc-123  •  Turn: 15  •  2h ago  •  [🔗 Open Session]      │
├────────────────────────────────────────────────────────────────────────┤
│  Files: src/auth/UserService.ts, src/auth/strategies/*.ts            │
│  ──────────────────────────────────────────────────────────────────  │
│  ➖ class UserService {                                              │
│  ➕ class UserService {                                              │
│  ➖   constructor(private db: DB) {}                                 │
│  ➕   constructor(private strategy: AuthStrategy) {}                │
│  ➖   async findUser(id) { return this.db.get(id); }                 │
│  ➕   async findUser(id) { return this.strategy.findById(id); }     │
│  }                                                                   │
│  ──────────────────────────────────────────────────────────────────  │
│  [Copy Diff]  [Apply to Workspace]  [Pin/Unpin]  [Delete]           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Chat Search and Artifacts

  Scenario: Search finds relevant past conversation
    Given a past session where user discussed "payment retry logic"
    When user searches "payment retry"
    Then results include that session with highlighted snippet
    And clicking "Restore Context" starts new session with that history

  Scenario: Artifact created from tool result
    When agent calls edit_file and produces a diff
    Then a diff_card artifact is auto-created
    And appears in Artifacts panel with correct title/files

  Scenario: Artifact pinned and persists across sessions
    Given user pins a mermaid diagram artifact
    And restarts VS Code
    Then artifact still appears in Pinned section

  Scenario: Hybrid search ranks well
    Given 100 past turns with varied topics
    When searching "typescript interface"
    Then turns about TS interfaces rank higher than generic "type" mentions

  Scenario: Export artifacts as markdown
    When user selects 3 artifacts and clicks "Export as Markdown"
    Then .md file generated with proper formatting (diff blocks, images, mermaid)
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-10_Context_Compaction.md` | 선행 | 컴팩션 시 아티팩트/검색 인덱스 보존 |
| `PRD-15_Memories.md` | 병행 | 메모리와 아티팩트 연계 (메모리에서 아티팩트 링크) |
| `sqlite-vec`, `all-MiniLM-L6-v2 ONNX` | 런타임 | 로컬 벡터 검색 (Apache 2.0 / MIT) |
| `BM25` (typescript 구현) | 런타임 | 키워드 검색 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | DB 스키마 + 턴 인덱싱 파이프라인 | 턴 저장/임베딩 동작 |
| 2 | BM25 + 벡터 하이브리드 검색 + RRF | 검색 API 완성 |
| 3 | 검색 사이드바 UI + 필터 + 프리뷰 | 사용자 검색 UX |
| 4 | 아티팩트 추출기 + 타입별 렌더러 | Diff/Image/Mermaid/Code 표시 |
| 5 | 아티팩트 패널 + 핀/내보내기 | 아티팩트 관리 UI |
| 6 | 컨텍스트 복원 (`@artifact:`, "이 대화로 계속") | 워크플로 연계 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 임베딩 모델 크기 (번들 크기 증가) | 중간 | `all-MiniLM-L6-v2` ~22MB, lazy load, 옵션으로 비활성화 가능 |
| DB 잠금/동시성 (여러 세션) | 중간 | `sqlite` WAL 모드, 연결 풀링, 세션별 별도 DB 파일 옵션 |
| 아티팩트 대용량 (스크린샷 base64) | 중간 | 외부 파일 저장 + DB엔 경로만, 자동 압축(WebP) |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: 대화 검색 · 아티팩트**
- sqlite-vec: https://github.com/asg017/sqlite-vec
- RRF: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf