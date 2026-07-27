# PRD-Tools-G: Debug Mode Tools (Debug 모드 전용)

> **Category**: Tool Catalog — G. Debug mode tools  
> **Phase**: **C6** (Debug Mode)  
> **Related PRDs**:  
> - `../01_S_Tier_Immediate_Impact/PRD-03_Agent_Loop_Modes.md`  
> - `../04_Implementation_Phases/PRD-C6_Debug_Mode.md`  
> - `../05_Core_Infrastructure/PRD-Infra-04_Tool_Registry.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-03_Cursor_Pattern.md`  
> **Out of Scope**: 일반 `edit_file` 일상 패치(B), Browser(D·C7), 도메인 Specialized Utility(구 G) — 도메인은 `PRD-24`~`PRD-27`

---

## 1. Overview

`Extension_high_impact.md` **G. Debug 모드 전용**과 동일. 가설 → 계측 → 재현 → 로그 → 최소 수정 → 청소.

| 도구 | 역할 |
|------|------|
| `add_instrumentation` | 가설 검증용 로그 삽입 |
| `collect_runtime_logs` | 로컬 debug 서버에서 로그 수집 |
| `request_reproduce` | 사용자 재현 대기 |
| `remove_instrumentation` | 확정 후 계측 제거 |

구현은 **별도 도구**로 두거나, 일반 `edit_file` + 확장 내부 Debug 서비스로 묶어도 된다. 레지스트리 노출은 **Debug 모드 화이트리스트**에만.

> 이 파일은 **도구 카탈로그 G**이다. 펌웨어/레거시/MISRA/시리얼 등은 여기 두지 않는다.

---

## 2. Tool Definitions

### 2.1 `add_instrumentation`

```typescript
// 의도: 가설별 로그 포인트 삽입. 일반 기능 패치와 구분되는 계측 편집
{
  name: "add_instrumentation",
  description: "Insert debug logging for a hypothesis. Tracks spans for later removal.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      hypothesis_id: { type: "string" },
      statements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            anchor_old_string: { type: "string", description: "Unique anchor near insert point" },
            log_expression: { type: "string", description: "Expression/message to log" },
            position: { type: "string", enum: ["before", "after", "replace"], default: "after" }
          },
          required: ["anchor_old_string", "log_expression"]
        }
      }
    },
    required: ["path", "hypothesis_id", "statements"],
    additionalProperties: false
  }
}
```

내부적으로 Search–Replace/`WorkspaceEdit`를 쓰더라도 **Pending/Review**에는 `instrumentation` 태그로 표시.

---

### 2.2 `collect_runtime_logs`

```typescript
{
  name: "collect_runtime_logs",
  description: "Fetch logs from the local debug instrumentation endpoint since a cursor.",
  parameters: {
    type: "object",
    properties: {
      since_ms: { type: "integer", description: "Epoch ms lower bound" },
      hypothesis_id: { type: "string" },
      max_entries: { type: "integer", default: 200, maximum: 2000 }
    },
    additionalProperties: false
  }
}
```

확장 로컬 로그 수집 엔드포인트(Debug 계측 서버) — Extension_high_impact 인프라 표와 동일.

---

### 2.3 `request_reproduce`

```typescript
// 의도: 사용자에게 재현 절차를 안내하고 완료 신호를 기다림 (ask_question의 Debug 특화)
{
  name: "request_reproduce",
  description: "Ask the user to reproduce the bug; pause until confirmed or timeout.",
  parameters: {
    type: "object",
    properties: {
      steps_markdown: { type: "string" },
      expected_signal: { type: "string", description: "What log/UI proves reproduction" },
      timeout_ms: { type: "integer", default: 600000 }
    },
    required: ["steps_markdown"],
    additionalProperties: false
  }
}
```

---

### 2.4 `remove_instrumentation`

```typescript
{
  name: "remove_instrumentation",
  description: "Remove instrumentation for one hypothesis or all after fix is accepted.",
  parameters: {
    type: "object",
    properties: {
      hypothesis_id: { type: "string", description: "Omit to remove all session instrumentation" },
      path: { type: "string", description: "Optional file filter" }
    },
    additionalProperties: false
  }
}
```

루프: 증거 기반 최소 `edit_file`(B) → 검증 → `remove_instrumentation`.

---

## 3. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| Debug G tools | ⚪ Debug 모드 + 짧은 예산일 때만 | ✅ Debug 모드 |

일반 Agent 모드 스키마에는 **포함하지 않음**.  
Tier A LOCKED remains: Browser, image gen, bulk MCP, `delete_file`, multi-subagent, arbitrary shell — **allowlisted terminal still allowed** in Agent.

---

## 4. Mode Whitelist Notes

| Mode | G tools |
|------|---------|
| **Ask** | ❌ |
| **Agent** | ❌ (일반 패치만 B) |
| **Plan** | ❌ |
| **Debug** | ✅ 네 도구 + 읽기(A) + 최소 `edit_file`(B) + (옵션) allowlist terminal(C) |

암기: Ask→Understand · Plan→Think · Agent→Build · **Debug→Fix (runtime evidence)**.

---

## 5. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1~C3 MVP** | 없음 |
| **C4+** | 계측 서버 준비(선택) |
| **C6** | G 도구 풀세트 + Debug 모드 프롬프트 |
| **C7** | Browser로 UI 재현 보조(D) — G 자체는 C6 |

---

## 6. Acceptance Criteria

- [ ] Given Agent mode, When schemas built, Then G tools absent
- [ ] Given Debug mode, When hypotheses formed, Then `add_instrumentation` → `request_reproduce` → `collect_runtime_logs` → patch → `remove_instrumentation`
- [ ] Given fix accepted, When cleanup runs, Then no leftover instrumentation markers
- [ ] File is **not** a dump of domain specialized utilities

---

## 7. Dependencies

| 관심사 | Owner |
|--------|--------|
| Debug mode UX/loop | `PRD-C6_Debug_Mode.md` |
| Mode picker | `PRD-03_Agent_Loop_Modes.md` |
| Registry mode filter | `PRD-Infra-04_Tool_Registry.md` |

---

## 8. Out of Scope

- 일상 Search–Replace → B  
- Browser Design Mode → D / C7  
- Specialized domain (SVD, legacy, MISRA, serial) → `PRD-24`~`PRD-27`  
- 구 Specialized Utility 카탈로그 내용 이관 — **하지 않음** (도메인은 PRD-24~27)
