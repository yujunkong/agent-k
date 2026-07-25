# PRD-Harness-04: Memories (Minimal) — 메모리 최소 구현

> **Category**: Medium Model Harness  
> **Phase**: C4 (C3 멀티턴 안정화 후)  
> **관련 PRD**: `PRD-15_Memories.md`, `PRD-Infra-02_Context_Assembly.md`, `PRD-Harness-02_Verification_First.md`

---

## 1. Overview

### 목적
세션을 넘어 **사용자 선호·프로젝트 사실**을 영구 기억하고, 매 턴 **예산 1~2%만 써서** 컨텍스트에 주입한다. **자동 장기 기억은 환각 위험** → **명시 저장 + 사용자 편집**만 허용.

### 비즈니스 가치
- **반복 지시 제거**: "이 프로젝트는 NestJS 쓴다" 매번 말 안 해도 됨
- **온보딩 가속**: 새 멤버도 메모리 보면 프로젝트 컨벤션 바로 파악
- **환각 방지**: 명시 저장 + 사용자 편집만 허용 → 거짓 기억 차단

---

## 2. Functional Requirements

### 2.1 저장 트리거
| 트리거 | 동작 | 예시 |
|--------|------|------|
| **명시 지시** | "기억해: 이 프로젝트는 NestJS v10 쓴다" | `save_memory` 도구 호출 |
| **반복 패턴 감지** | 동일 지시 3회 이상 감지 → "이 패턴 기억할까요?" 토스트 | 자동 제안 → 사용자 승인 시 저장 |
| **모델 제안** | 모델이 "이 사실을 기억에 저장하시겠습니까?" 도구 호출 | 사용자 승인 후 저장 |

### 2.2 메모리 스키마 (`src/memory/schema.ts`)

```typescript
export interface MemoryEntry {
  key: string;                    // 고유 키: "framework", "naming:hooks", "pref:logging"
  value: string;                  // 내용 (≤ 500자)
  scope: 'user' | 'workspace' | 'team';  // 저장 범위
  source: 'explicit' | 'detected' | 'model_proposed'; // 출처
  tags: string[];                 // 필터용: ["framework", "backend", "nestjs"]
  confidence?: number;            // 0~1 (detected/model_proposed용)
  createdAt: number;
  updatedAt: number;
  version: number;                // 낙관적 락용
}
```

### 2.3 저장소 계층 분리
| 범위 | 저장소 | 영속성 | 공유 |
|------|--------|--------|------|
| **User** | `globalState['agentK.memories.user']` | 머신별 영구 | 본인만 |
| **Workspace** | `workspaceState['agentK.memories.workspace']` | 워크스페이스 내 영구 | 워크스페이스 공유 |
| **Team** | `.agentk/team-memories.json` (Git 커밋) | Git 히스토리 | 팀 전체 (Git 동기화) |

### 2.4 주입 정책 (Context Assembly 시)
| 규칙 | 상세 |
|------|------|
| **예산** | 전체 컨텍스트의 **1~2%** (128k 기준 1.3k~2.5k 토큰) |
| **우선순위** | Team > Workspace > User (같은 키면 상위 우선) |
| **정렬** | `updatedAt` 내림차순 (최근 갱신 우선) |
| **최대 개수** | 60개 (평균 30토큰 × 60 = 1.8k 토큰) |
| **포맷** | `## Active Memories\n- [scope] key: value #tag1 #tag2` |

### 2.5 관리 UI (Webview)
| 기능 | 상세 |
|------|------|
| **목록** | 키, 값, 범위, 출처, 태그, 생성일, 수정일 컬럼 |
| **편집** | 인라인 편집 (값, 태그, 범위 변경) → Enter 저장 |
| **삭제** | 체크박스 다중 선택 → 삭제 버튼 → 확인 모달 |
| **이동** | 우클릭 → "Move to Team/User/Workspace" |
| **가져오기/내보내기** | JSON 파일로 백업/복원, 팀 온보딩용 |
| **검색/필터** | 키/값/태그/범위/출처 필터 |

---

## 3. Technical Spec

### 3.1 Memory Manager (`src/memory/manager.ts`)

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

  private async loadAll(): Promise<void> {
    this.userMemories = new Map(Object.entries(this.globalState.get<Record<string, MemoryEntry>>('agentK.memories.user') || {}));
    this.workspaceMemories = new Map(Object.entries(this.workspaceState.get<Record<string, MemoryEntry>>('agentK.memories.workspace') || {}));
    
    const teamPath = path.join(this.workspaceRoot, '.agentk', 'team-memories.json');
    if (await fs.pathExists(teamPath)) {
      this.teamMemories = new Map(Object.entries(JSON.parse(await fs.readFile(teamPath, 'utf8'))));
    }
  }

  async save(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt' | 'version'>): Promise<void> {
    const now = Date.now();
    const full: MemoryEntry = {
      ...entry,
      createdAt: entry.createdAt || now,
      updatedAt: now,
      version: (entry.version || 0) + 1,
    };

    const map = this.getMap(entry.scope);
    const existing = map.get(entry.key);
    if (existing && existing.version !== entry.version) {
      throw new Error(`Memory ${entry.key} was modified by another process. Reload and retry.`);
    }
    
    map.set(entry.key, full);
    await this.persist(entry.scope);
  }

  private async persist(scope: MemoryScope): Promise<void> {
    const map = this.getMap(scope);
    const obj = Object.fromEntries(map);
    
    if (scope === 'user') {
      await this.globalState.update('agentK.memories.user', obj);
    } else if (scope === 'workspace') {
      await this.workspaceState.update('agentK.memories.workspace', obj);
    } else {
      const teamPath = path.join(this.workspaceRoot, '.agentk', 'team-memories.json');
      await fs.ensureDir(path.dirname(teamPath));
      await fs.writeFile(teamPath, JSON.stringify(obj, null, 2));
    }
  }

  getAllForInjection(): MemoryEntry[] {
    const all = [
      ...this.teamMemories.values(),
      ...this.workspaceMemories.values(),
      ...this.userMemories.values(),
    ];
    
    // 중복 키 제거 (Team > Workspace > User 우선순위)
    const deduped = new Map<string, MemoryEntry>();
    for (const mem of all) {
      if (!deduped.has(mem.key)) deduped.set(mem.key, mem);
    }
    
    // 예산 내 정렬: 최근 업데이트 우선, 최대 60개
    return Array.from(deduped.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60);
  }

  formatForInjection(memories: MemoryEntry[]): string {
    if (memories.length === 0) return '';
    
    return `## Active Memories\n${memories.map(m => 
      `- [${m.scope}] ${m.key}: ${m.value}${m.tags.length ? ` #${m.tags.join(' #')}` : ''}`
    ).join('\n')}`;
  }

  // 반복 패턴 감지 → 저장 제안
  async detectAndSuggest(userMessage: string): Promise<MemorySuggestion | null> {
    // 최근 20턴에서 동일 키워드 3회 이상 등장 → 제안
    // 구현: 키워드 빈도 수 + 최근 3회 연속 동일 의도 감지
  }
}
```

### 3.2 `save_memory` 도구 (`src/tools/memoryTools.ts`)

```typescript
export const saveMemoryTool: ToolDefinition = {
  name: 'save_memory',
  description: 'Store a fact or preference for future sessions',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', pattern: '^[a-z0-9:_\\-.]+$', maxLength: 64 },
      value: { type: 'string', maxLength: 500 },
      scope: { type: 'string', enum: ['user', 'workspace', 'team'], default: 'workspace' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    },
    required: ['key', 'value', 'scope'],
  },
  handler: async (args, ctx) => {
    await memoryManager.save({ ...args, source: 'explicit' });
    return { ok: true, message: `Memory saved: ${args.key} (${args.scope})` };
  },
};
```

### 3.3 컨텍스트 조립 시 주입 (`src/agent/contextAssembler.ts`)

```typescript
function injectMemories(systemPrompt: string, memories: MemoryEntry[]): string {
  if (memories.length === 0) return systemPrompt;
  
  const memBlock = memoryManager.formatForInjection(memories);
  const tokenCount = tokenizer.count(memBlock);
  
  // 예산 2% 초과 시 잘라내기
  const maxTokens = Math.floor(totalBudget * 0.02);
  if (tokenCount > maxTokens) {
    // 최신순으로 자르기 (이미 정렬됨)
    const truncated = memories.slice(0, 60); // 이미 60개 제한
    return systemPrompt + '\n\n' + memoryManager.formatForInjection(truncated);
  }
  
  return systemPrompt + '\n\n' + memBlock;
}
```

---

## 4. UI/UX Specification

### 4.1 메모리 패널 (사이드바)
```
┌─ Memories (12) ─────────────────────────────────────────────────────┐
│  🔍 [Search...]  [Scope: All ▼]  [Source: All ▼]  [+ Add]          │
├──────────────────────────────────────────────────────────────────────┤
│ 🏷 team      │ framework        │ NestJS v10 + TypeORM            │
│ 🏷 workspace │ naming:hooks     │ camelCase, prefix "use"         │
│ 🏷 workspace │ pref:logging     │ pino, no console.log             │
│ 🏷 user      │ pref:formatting  │ prettier, single quotes          │
│ 🏷 workspace │ db:orm           │ TypeORM, migrations required     │
│ 🏷 user      │ style:comments   │ JSDoc for public APIs            │
├──────────────────────────────────────────────────────────────────────┤
│  [Edit] [Move to Team] [Delete]    (선택 시 하단에 액션 바)           │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 반복 감지 토스트
```
┌────────────────────────────────────────────────────────────────┐
│ 💡 "이 프로젝트는 NestJS 쓴다" 가 3번 언급되었습니다.          │
│   [메모리에 저장]  [나중에]  [다시 묻지 않음]                   │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Memories (Minimal)

  Scenario: Explicit memory save and injection
    Given user says "기억해: 이 프로젝트는 NestJS v10 쓴다"
    When model calls save_memory({key: "framework", value: "NestJS v10", scope: "workspace"})
    Then memory saved to workspaceState
    And next turn system prompt includes "- [workspace] framework: NestJS v10"
    And model answers framework questions correctly without re-asking

  Scenario: Repetition detection suggests save
    Given user mentions "pino logger 써" 3 times in 10 turns
    When 3rd mention detected
    Then toast appears: "pino logger 언급 3회 감지. 메모리에 저장할까요?"
    And user clicks "Save" → memory saved with source="detected"

  Scenario: Memory scope precedence
    Given team memory "framework: NestJS"
    And workspace memory "framework: Express" (conflict)
    And user memory "framework: Fastify" (conflict)
    When context assembled
    Then team memory wins (Team > Workspace > User)
    And only "framework: NestJS" injected

  Scenario: Memory budget enforced
    Given 100 memories exist (avg 30 tokens each = 3000 tokens)
    And context budget 2% = 2560 tokens (128k context)
    When assembling context
    Then only newest 60 memories injected (~1800 tokens)
    And oldest 40 dropped silently

  Scenario: User edits/deletes memory via UI
    Given memory "naming:hooks" exists
    When user changes value to "snake_case" and saves
    Then memory updated, updatedAt refreshed
    And next injection shows new value
    And version incremented (optimistic lock)

  Scenario: Team memory synced via Git
    Given .agentk/team-memories.json committed to repo
    When teammate pulls and opens workspace
    Then team memories loaded automatically
    And appear with 🏷 team badge in UI
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 5. References

- `PRD-15_Memories.md` — 상세 구현 계획
- `PRD-Infra-02_Context_Assembly.md` — 주입 예산/슬롯
- `PRD-Harness-02_Verification_First.md` — 메모리도 검증 대상 아님 (명시 저장만)
- `PRD-15_Memories.md` — 원본 설계 문서