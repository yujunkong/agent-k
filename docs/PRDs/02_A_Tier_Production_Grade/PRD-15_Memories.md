# PRD-15: Memories (Memories - 세션 넘어 선호·사실 유지)

> **Priority**: A급 (반복 지시 감소)  
> **Phase**: C4 (C7에서 고도화)  
> **관련 PRD**: `PRD-Infra-10_Context_Compaction.md`, `PRD-Harness-04_Memories_Minimal.md`

---

## 1. Overview

### 목적
모델이 "기억해" / 반복 선호를 감지하면 **명시적으로** `workspaceState`에 key-value로 저장하고, 매 턴 Rules 옆에 1~2% 예산으로 주입한다. **자동 장기기억은 환각 위험** → **명시 저장 + 사용자 편집** 권장.

### 비즈니스 가치
- "이 프로젝트는 TypeScript strict mode 써" 같은 반복 지시 제거
- 팀/개인 선호 스타일(네이밍, 아키텍처 패턴) 자동 적용
- 온보딩 새 멤버도 기존 컨텍스트 즉시 공유

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이 프로젝트는 React Query v5 쓴다"고 한 번 말하면 이후 자동으로 적용되길 원한다 |
| US-02 | 개발자로서, 메모리 목록을 보고 잘못된 거 삭제/수정하고 싶다 |
| US-03 | 팀 리더로서, 팀 공통 메모리(컨벤션, 금지 패턴)를 `.agentk/team-memories.json`로 커밋해 공유하고 싶다 |

---

## 2. Functional Requirements

### 2.1 메모리 저장 트리거
| FR-ID | 트리거 | 동작 |
|-------|--------|------|
| FR-01 | 사용자 명시 | "이거 기억해: ..." / "기억해: 프로젝트는 NestJS 쓴다" |
| FR-02 | 반복 패턴 감지 | 동일 지시 3회 이상 → "이 패턴 기억할까요?" 확인 후 저장 |
| FR-03 | 모델 제안 | 모델이 "이 사실을 기억에 저장하시겠습니까?" tool_call (`save_memory`) |

### 2.2 메모리 스키마 및 저장소
```typescript
interface MemoryEntry {
  key: string;                    // 고유 키 (예: "framework", "naming:hooks")
  value: string;                  // 내용 (예: "React Query v5, use camelCase for hooks")
  scope: 'user' | 'workspace' | 'team';  // 저장 범위
  source: 'explicit' | 'detected' | 'model_proposed'; // 출처
  createdAt: number;
  updatedAt: number;
  tags?: string[];                // 필터링용
  confidence?: number;            // 0~1 (detected/model_proposed용)
}
```

| 저장소 | 범위 | API |
|--------|------|-----|
| `globalState` | user | 개인 선호 (머신 공유) |
| `workspaceState` | workspace | 프로젝트별 사실 |
| `.agentk/team-memories.json` | team | Git 커밋으로 팀 공유 (선택) |

### 2.3 메모리 주입 (Context Assembly)
- 매 턴 시스템 프롬프트 뒤, Rules 앞에 **`## Active Memories`** 블록 삽입
- 토큰 예산: 전체 컨텍스트의 **1~2%** (예: 128k → 1.2~2.5k tokens)
- 우선순위: `scope: team` > `workspace` > `user`, `updatedAt` 최근순

### 2.4 메모리 관리 UI (Webview)
| FR-ID | 기능 | 상세 |
|-------|------|------|
| FR-04 | 목록 보기 | 키, 값, 범위, 출처, 생성일, 태그 |
| FR-05 | 편집/삭제 | 인라인 편집, 삭제 확인 모달 |
| FR-06 | 가져오기/내보내기 | JSON 파일로 백업/복원, 팀 공유용 |
| FR-07 | 범위 이동 | Personal ↔ Workspace ↔ Team 간 이동 |

### 2.5 `save_memory` 도구
```json
{
  "name": "save_memory",
  "description": "Store a fact or preference for future sessions",
  "parameters": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "pattern": "^[a-z0-9:._-]+$" },
      "value": { "type": "string", "maxLength": 500 },
      "scope": { "type": "string", "enum": ["user", "workspace", "team"] },
      "tags": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["key", "value", "scope"]
  }
}
```

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 메모리 개수 상한 | user: 50, workspace: 100, team: 200 |
| NFR-02 | 값 길이 상한 | 500자 (초과 시 요약 권장) |
| NFR-03 | 주입 지연 | 컨텍스트 조립 시 < 5ms |
| NFR-04 | 동시 편집 안전성 | `workspaceState` 원자적 업데이트 (버전 체크) |

---

## 4. API & Technical Spec

### 4.1 Memory Manager (`src/memory/manager.ts`)

```typescript
export class MemoryManager {
  private userMemories: Map<string, MemoryEntry> = new Map();
  private workspaceMemories: Map<string, MemoryEntry> = new Map();
  private teamMemories: Map<string, MemoryEntry> = new Map();

  constructor(
    private globalState: vscode.Memento,
    private workspaceState: vscode.Memento,
    private workspaceRoot: string
  ) {
    this.loadAll();
  }

  private loadAll(): void {
    this.userMemories = new Map(Object.entries(this.globalState.get('agentK.memories.user') || {}));
    this.workspaceMemories = new Map(Object.entries(this.workspaceState.get('agentK.memories.workspace') || {}));
    
    // Team memories from file
    const teamPath = path.join(this.workspaceRoot, '.agentk', 'team-memories.json');
    if (fs.existsSync(teamPath)) {
      this.teamMemories = new Map(Object.entries(JSON.parse(fs.readFileSync(teamPath, 'utf8'))));
    }
  }

  private saveAll(): void {
    this.globalState.update('agentK.memories.user', Object.fromEntries(this.userMemories));
    this.workspaceState.update('agentK.memories.workspace', Object.fromEntries(this.workspaceMemories));
    
    const teamPath = path.join(this.workspaceRoot, '.agentk', 'team-memories.json');
    fs.mkdirSync(path.dirname(teamPath), { recursive: true });
    fs.writeFileSync(teamPath, JSON.stringify(Object.fromEntries(this.teamMemories), null, 2));
  }

  getAllForInjection(): MemoryEntry[] {
    const all = [
      ...this.teamMemories.values(),
      ...this.workspaceMemories.values(),
      ...this.userMemories.values(),
    ];
    // 토큰 예산 내 정렬: scope 우선순위 + 최근 업데이트
    return all
      .sort((a, b) => {
        const scopeOrder = { team: 0, workspace: 1, user: 2 };
        if (scopeOrder[a.scope] !== scopeOrder[b.scope]) return scopeOrder[a.scope] - scopeOrder[b.scope];
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, this.calculateBudget());
  }

  private calculateBudget(): number {
    // 전체 컨텍스트 128k 기준 1.5% = 1920 tokens ≈ 60 entries (평균 30 tokens)
    return 60; 
  }

  async save(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = Date.now();
    const full: MemoryEntry = { ...entry, createdAt: now, updatedAt: now };
    
    const map = this.getMap(entry.scope);
    map.set(entry.key, full);
    this.saveAll();
  }

  async update(key: string, scope: MemoryScope, updates: Partial<MemoryEntry>): Promise<void> {
    const map = this.getMap(scope);
    const existing = map.get(key);
    if (!existing) throw new Error(`Memory not found: ${key}`);
    map.set(key, { ...existing, ...updates, updatedAt: Date.now() });
    this.saveAll();
  }

  async delete(key: string, scope: MemoryScope): Promise<void> {
    this.getMap(scope).delete(key);
    this.saveAll();
  }

  private getMap(scope: MemoryScope): Map<string, MemoryEntry> {
    switch (scope) {
      case 'user': return this.userMemories;
      case 'workspace': return this.workspaceMemories;
      case 'team': return this.teamMemories;
    }
  }
}
```

### 4.2 컨텍스트 조립 시 주입 (`src/agent/contextAssembler.ts`)

```typescript
function injectMemories(systemPrompt: string, memories: MemoryEntry[]): string {
  if (memories.length === 0) return systemPrompt;
  
  const memBlock = memories.map(m => 
    `- [${m.scope}] ${m.key}: ${m.value}${m.tags?.length ? ` #${m.tags.join(', ')}` : ''}`
  ).join('\n');
  
  return `${systemPrompt}\n\n## Active Memories (read-only)\n${memBlock}\n`;
}
```

### 4.3 반복 패턴 감지 (`src/memory/detector.ts`)

```typescript
export class RepetitionDetector {
  private recentInstructions: string[] = []; // 최근 20턴 사용자 메시지
  
  onUserMessage(text: string): void {
    this.recentInstructions.push(text);
    if (this.recentInstructions.length > 20) this.recentInstructions.shift();
  }

  detectPatterns(): { key: string; value: string; count: number }[] {
    // 단순 휴리스틱: 동일 키워드 3회 이상
    const freq = new Map<string, number>();
    for (const msg of this.recentInstructions) {
      const words = msg.toLowerCase().match(/\b\w{4,}\b/g) || [];
      for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    }
    return Array.from(freq.entries())
      .filter(([,c]) => c >= 3)
      .map(([word, count]) => ({ key: `pref:${word}`, value: `User frequently mentions "${word}"`, count }));
  }
}
```

---

## 5. UI/UX Specification

### 5.1 메모리 패널 (사이드바 뷰)
```
┌─ Memories ────────────────────────────────────────────────────────────┐
│  [+ Add]  [Import]  [Export]  [Scope: All ▼]  [Search...]            │
├────────────────────────────────────────────────────────────────────────┤
│ 🏷 team        │ framework          │ NestJS v10, TypeORM            │
│ 🏷 team        │ naming:controllers │ suffix "Controller", PascalCase│
│ 🏢 workspace   │ db:connection      │ PostgreSQL, pooling via PgBouncer│
│ 👤 user        │ style:hooks        │ camelCase, prefix "use"        │
│ 👤 user        │ pref:logging       │ Use pino, no console.log       │
├────────────────────────────────────────────────────────────────────────┤
│  Inline edit: click value → edit → Enter to save, Esc to cancel      │
│  Right-click: Move to..., Delete, Copy key                           │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 메모리 추가 모달
```
┌─ Add Memory ──────────────────────────────────────┐
│  Key:        [framework_______________]  (a-z, :, ., _) │
│  Value:      [NestJS v10 with TypeORM___________________] │
│  Scope:      [Workspace ▼]  (User / Workspace / Team)    │
│  Tags:       [backend, orm, nestjs____________________]  │
│                                              [Cancel] [Save] │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 반복 감지 토스트
```
💡 "React Query v5 사용" 패턴이 3번 감지되었습니다.
   [메모리에 저장]  [나중에]  [무시]
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Memories

  Scenario: Explicit memory save and injection
    Given user says "기억해: 이 프로젝트는 Next.js 14 App Router 쓴다"
    When model calls save_memory({key: "framework", value: "Next.js 14 App Router", scope: "workspace"})
    Then memory stored in workspaceState
    And next turn system prompt includes "framework: Next.js 14 App Router"
    And model answers framework questions correctly without re-asking

  Scenario: Repetition detection prompts save
    Given user mentions "pino 로거 써" in 3 separate messages
    When detector triggers
    Then toast appears "패턴 감지: pino 로거 사용"
    And user clicks "저장" → memory created with source="detected"

  Scenario: Memory budget respected
    Given 100 workspace memories exist
    When context assembled
    Then only top 60 (by scope priority + recency) injected
    And token count of memory block < 2.5k

  Scenario: Team memory shared via Git
    Given .agentk/team-memories.json committed to repo
    When teammate opens workspace
    Then team memories loaded automatically
    And appear with 🏷 badge in memory panel

  Scenario: User edits/deletes memory
    Given memory "naming:hooks" exists
    When user changes value to "snake_case for hooks"
    Then updatedAt refreshed
    And next injection reflects new value
    And user can delete with confirmation
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-02_Context_Assembly.md` | 선행 | 컨텍스트 예산 내 주입 로직 |
| `PRD-Infra-10_Context_Compaction.md` | 병행 | 긴 세션에서 메모리 보호 구간 지정 |
| `PRD-Harness-04_Memories_Minimal.md` | 상위 | 하네스 레벨 최소 구현 스펙 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | MemoryManager + 3계층 저장소 + `save_memory` 도구 | 기본 CRUD 동작 |
| 2 | 컨텍스트 조립기 주입 + 예산 제한 | 턴마다 메모리 블록 주입 |
| 3 | 메모리 패널 Webview (목록/편집/이동) | 사용자 관리 UI |
| 4 | 반복 패턴 감지기 + 토스트 제안 | 자동 메모리 후보 |
| 5 | 팀 메모리 파일 동기화 + Git 연동 | 팀 공유 워크플로 |
| 6 | Import/Export + 마이그레이션 | 백업/복원/이관 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 잘못된 메모리 주입으로 모델 오도 | 높음 | 사용자 편집/삭제 쉬움, confidence 낮으면 주입 안 함 |
| 메모리 누적 컨텍스트 초과 | 중간 | 하드 캡(60개) + scope 우선순위 + 요약 옵션 |
| 팀 메모리 충돌 (동시 편집) | 낮음 | Git merge로 해결, 로컬 workspace 메모리로 오버라이드 가능 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: Memories**, **중급 모델용 하네스: Memories (최소)**
- VS Code Memento API: https://code.visualstudio.com/api/references/vscode-api#Memento