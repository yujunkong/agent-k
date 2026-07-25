# PRD-Tools-E: User · Session UX (사용자 · 세션 UX)

> **Category**: Tool Catalog — E. User · Session UX  
> **Phase**: MVP **C1~C3** (`ask_question`, `todo_write`) → C5 (`switch_mode` Plan 연동) → C7 (`fetch_rules` / Skills 인접)  
> **Related PRDs**:  
> - `../01_S_Tier_Immediate_Impact/PRD-03_Agent_Loop_Modes.md`  
> - `../04_Implementation_Phases/PRD-C1_Ask_Mode.md`  
> - `../04_Implementation_Phases/PRD-C3_Agent_MultiTurn.md`  
> - `../04_Implementation_Phases/PRD-C5_Plan_Mode.md`  
> - `../05_Core_Infrastructure/PRD-Infra-01_Instructions_Rules.md`  
> - `../05_Core_Infrastructure/PRD-Infra-19_Session_Manager.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md`  
> **Out of Scope**: 서브에이전트/`task`(F), MCP(F), Debug 계측 대기 UI의 **도구면**은 G의 `request_reproduce`와 구분

---

## 1. Overview

`Extension_high_impact.md` **E. 사용자 · 세션 UX**와 동일.

| 도구 | 역할 |
|------|------|
| `ask_question` | 중간 확인 (객관식/폼) |
| `todo_write` | 체크리스트 / 진행 표시 |
| `fetch_rules` | 규칙 동적 로드 |
| `switch_mode` | Ask/Agent/Plan/Debug 전환 |

루프를 끊지 않고 사용자·세션 상태를 조종하는 얇은 UX 도구 축이다.

---

## 2. Tool Definitions

### 2.1 `ask_question`

```typescript
// 의도: Plan 확인 질문·모호한 요구 명확화. 채팅 폼/모달로 렌더
{
  name: "ask_question",
  description: "Ask the user a structured question and wait for answers.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      questions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            prompt: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" }
                },
                required: ["id", "label"]
              }
            },
            allow_multiple: { type: "boolean", default: false }
          },
          required: ["id", "prompt", "options"]
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  }
}
```

에이전트 루프는 응답이 올 때까지 **paused** (maxTurns 타이머 정책은 Infra-12와 조율).

---

### 2.2 `todo_write`

```typescript
{
  name: "todo_write",
  description: "Create or update the session todo checklist for long tasks.",
  parameters: {
    type: "object",
    properties: {
      merge: { type: "boolean", description: "Merge by id vs replace entire list" },
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] }
          },
          required: ["id", "content", "status"]
        }
      }
    },
    required: ["todos", "merge"],
    additionalProperties: false
  }
}
```

C5 Plan: 계획 md → todo → (선택) 일부만 새 Agent로 분기 — 실행은 F의 `task`와 연결.

---

### 2.3 `fetch_rules`

```typescript
// 의도: 경로·모드별 규칙 동적 로드. 매 턴 전체 Rules dump 방지
{
  name: "fetch_rules",
  description: "Load applicable workspace/user rules for current path or mode.",
  parameters: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["user", "workspace", "path", "mode"] },
      path: { type: "string" },
      mode: { type: "string", enum: ["ask", "agent", "plan", "debug"] }
    },
    required: ["scope"],
    additionalProperties: false
  }
}
```

Owner: `PRD-Infra-01_Instructions_Rules.md`. Skills 패키지 로드는 F의 `skill`과 구분.

---

### 2.4 `switch_mode`

```typescript
{
  name: "switch_mode",
  description: "Request switching Agent panel mode (Ask/Agent/Plan/Debug).",
  parameters: {
    type: "object",
    properties: {
      target_mode: { type: "string", enum: ["ask", "agent", "plan", "debug"] },
      reason: { type: "string" }
    },
    required: ["target_mode"],
    additionalProperties: false
  }
}
```

실제 전환은 UI 확인 후 (강제 silent switch 금지 권장). 모드 정의: `PRD-03_Agent_Loop_Modes.md`.

---

## 3. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| `ask_question` | ✅ | ✅ |
| `todo_write` | ✅ | ✅ |
| `switch_mode` | ⚪ (Harness 보조 목록) | ✅ |
| `fetch_rules` | 🔒 / C7 | ✅ |

**Tier A LOCKED (세션 외)**: Browser, image gen, bulk MCP, `delete_file`, multi-subagent, arbitrary shell.  
Allowlisted terminal은 C에서 허용.

---

## 4. Mode Whitelist Notes

| Mode | Session UX |
|------|------------|
| **Ask** | `ask_question` ✅; `todo_write` ✅(탐색 체크리스트); 쓰기 모드 전환은 사용자 확인 |
| **Agent** | 전부 (정책) |
| **Plan** | `ask_question`·`todo_write` 핵심; `switch_mode`→Agent는 승인 후 |
| **Debug** | `ask_question` + G `request_reproduce` 병행 가능 |

---

## 5. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1~C3 MVP** | `ask_question`, `todo_write` |
| **C4+** | 세션 持久化·메시지 큐와 연동 |
| **C5~C7** | + `switch_mode` (Plan), `fetch_rules`, Plan Mermaid/todo 분기 |

---

## 6. Acceptance Criteria

- [ ] Given ambiguous task in Agent, When model calls `ask_question`, Then UI form blocks loop until answer
- [ ] Given Tier A Agent, When schemas built, Then `ask_question` and `todo_write` present
- [ ] Given Plan mode (C5), When clarifying, Then `ask_question` used before write tools
- [ ] Names match source: `ask_question`, `todo_write`, `fetch_rules`, `switch_mode`

---

## 7. Dependencies

| 관심사 | Owner |
|--------|--------|
| Modes | `PRD-03_Agent_Loop_Modes.md` |
| Plan UI | `PRD-C5_Plan_Mode.md` |
| Rules | `PRD-Infra-01_Instructions_Rules.md` |
| Session | `PRD-Infra-19_Session_Manager.md` |
| Tier A | `PRD-Harness-06_A_Tier_Whitelist.md` |

---

## 8. Out of Scope

- `skill` 핀/패키지 → F  
- `task` / `send_message` → F  
- Debug 전용 재현 대기 프로토콜 상세 → G / `PRD-C6_Debug_Mode.md`
