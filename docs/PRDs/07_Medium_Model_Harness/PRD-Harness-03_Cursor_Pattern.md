# PRD-Harness-03: Cursor Pattern (Cursor가 실제로 하는 방식)

> **Category**: Medium Model Harness  
> **Phase**: Benchmark (구현 전 검증)  
> **관련 PRD**: `PRD-Harness-02_Verification_First.md`, `PRD-Harness-08_Harness_Duties.md`, `PRD-C6_Debug_Mode.md`

---

## 1. Overview

### 목적
**Cursor Agent가 실제로 어떻게 동작하는지** 문서화하고, 우리 하네스가 그 동작을 **충실히 재현**하는지 벤치마크한다. "커서 흉내"가 아니라 **"커서가 하는 방식대로"** 구현했는지 검증용.

### 비즈니스 가치
- **검증 기준**: 우리 구현이 커서급 UX인지 객관적 기준
- **갭 분석**: 무엇이 빠졌는지, 뭐가 다른지 명확히 파악
- **우선순위**: "커서가 하는 것 중 우리가 안 한 것" 우선 구현

---

## 2. Cursor Agent 동작 분석 (2024-2025 기준)

### 2.1 핵심 루프 (공개 문서/커뮤니티 분석 종합)
```
User Message
    │
    ▼
Context Assembly (open tabs, @mentions, selection, git status, recent errors)
    │
    ▼
Model Call (with tools schema)
    │
    ├─► No tool_calls → Final Answer
    │
    └─► tool_calls exists
        │
        ├─► Read-only tools (grep, read, lsp) → Parallel execution
        │
        └─► Write/Exec tools
            │
            ├─► Diff Preview (Side-by-side)
            │
            ├─► User Approval (Allow Once / Allow Session / Deny)
            │
            └─► Apply → Result → Loop
```

### 2.2 Cursor만의 차별화 포인트
| 영역 | Cursor 동작 | 우리 구현 체크 |
|------|-------------|----------------|
| **Context** | Open tabs + @mention + selection + git status + recent errors | [ ] |
| **Tool Parallelism** | Read tools 10~20 parallel, Write sequential | [ ] |
| **Diff UI** | Side-by-side, hunk-level checkbox, inline accept | [ ] |
| **Approval** | Allow Once / Allow Session / Deny, keyboard shortcuts | [ ] |
| **Staleness** | Read 후 파일 수정 시 재읽기 강제 | [ ] |
| **Error Recovery** | Lint/test 실패 시 자동 재시도 (2~3회) | [ ] |
| **Context Compaction** | 50k 토큰 넘어가면 자동 요약 + 최근 6턴 보호 | [ ] |
| **Checkpoint** | 큰 변경 전 자동 스냅샷, 타임라인 UI로 복원 | [ ] |
| **Debug Mode** | Hypothesis → Instrument → Reproduce → Analyze → Patch → Verify → Clean | [ ] |
| **Plan Mode** | Questions UI (multiple choice) → Plan.md → Approve → Execute | [ ] |
| **Side Chat** | `/side` 로 읽기 전용 병렬 세션, `@side-result`로 인용 | [ ] |
| **Best-of-N** | `/best-of-n N=3` → worktree 병렬 → 비교 UI → 선택 | [ ] |

---

## 3. 벤치마크 체크리스트 (구현 검증용)

### 3.1 Core Loop
| 항목 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| 스트리밍 토큰 표시 | ✅ | | |
| Tool calling 스트리밍 중 감지 | ✅ | | |
| Read 도구 병렬 실행 (p-limit) | ✅ 16 | | |
| Write/Exec 순차 실행 + 승인 | ✅ | | |
| Staleness 체크 (mtime/hash) | ✅ | | |
| Stale 시 재읽기 강제 | ✅ | | |
| Doom Loop 감지 (3회) | ✅ | | |
| Max Turns / Timeout | ✅ | | |
| Stop 버튼 → AbortController | ✅ | | |

### 3.2 Context Assembly
| 항목 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| Open Tabs 요약 | ✅ | | |
| @file / @folder / @symbol | ✅ | | |
| Selection (현재 선택 영역) | ✅ | | |
| Git Status (staged/unstaged) | ✅ | | |
| Recent Errors (Diagnostics) | ✅ | | |
| Active Memories 주입 | ✅ | | |
| Pinned Artifacts | ✅ | | |
| Token Budget 관리 (슬롯별) | ✅ | | |

### 3.3 Diff & Approval UX
| 항목 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| Side-by-side Diff | ✅ | | |
| Unified Diff 토글 | ✅ | | |
| Hunk-level Checkbox | ✅ | | |
| Inline Accept/Reject | ✅ | | |
| Allow Once / Session / Always | ✅ | | |
| Keyboard Shortcuts (y/a/d) | ✅ | | |
| Keyboard: `y`=allow, `a`=allow all, `d`=deny | ✅ | | |

### 3.4 Advanced Modes
| 모드 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| Plan Mode (Questions → Mermaid → Approve → Execute) | ✅ | | |
| Debug Mode (Hypothesis → Instrument → Reproduce → Patch → Verify) | ✅ | | |
| Side Chat (`/side`) | ✅ | | |
| Best-of-N (`/best-of-n`) | ✅ | | |
| Worktree isolation | ✅ | | |
| Browser / Design Mode | ✅ | | |
| Agent Review (Pre-push) | ✅ | | |

### 3.5 Context Management
| 기능 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| Auto-compaction (>90% budget) | ✅ | | |
| Truncate old tool results | ✅ | | |
| Drop duplicate reads | ✅ | | |
| Micro-summary (heuristic) | ✅ | | |
| Full Compact (summarize all) | ✅ | | |
| Protect: System, Rules, Recent 6, Memories | ✅ | | |

### 3.5 Safety & Recovery
| 기능 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| Checkpoint before big edit | ✅ | | |
| Timeline UI for rollback | ✅ | | |
| Undo last N edits | ✅ | | |
| Secret scan (PreToolUse) | ✅ | | |
| Staleness check (mtime/hash) | ✅ | | |
| Permission Levels (Ask/Accept/Auto/Bypass) | ✅ | | |
| Allowlist for Terminal | ✅ | | |

### 3.6 Extended Ecosystem
| 기능 | Cursor | 우리 구현 | 상태 |
|------|--------|-----------|------|
| MCP Client (stdio/SSE) | ✅ | | |
| Tool Search / Deferred Load | ✅ | | |
| Skills / Prompt Templates | ✅ | | |
| Team Rules Sync (Git) | ✅ | | |
| Remote SSH / Dev Containers | ✅ | | |

---

## 3. Gap Analysis Template (작성용)

| 기능 영역 | Cursor | 우리 구현 | Gap | 우선순위 | 담당 |
|-----------|--------|-----------|-----|----------|------|
| Core Loop | ✅ | | | | |
| Context Assembly | ✅ | | | | |
| Parallel Read | ✅ | | | | |
| Diff UI | ✅ | | | | |
| Approval UX | ✅ | | | | |
| Staleness/Doom | ✅ | | | | |
| Plan Mode | ✅ | | | | |
| Debug Mode | ✅ | | | | |
| Side Chat | ✅ | | | | |
| Best-of-N | ✅ | | | | |
| Compaction | ✅ | | | | |
| Checkpoints | ✅ | | | | |
| Safety/Permission | ✅ | | | | |
| MCP | ✅ | | | | |
| Browser/Design | ✅ | | | | |

---

## 4. 우선순위 매트릭스 (Gap → 구현 순서)

| 우선순위 | 기능 | 이유 | 예상 공수 |
|----------|------|------|-----------|
| **P0** | Core Loop + Streaming + Parallel Read | 기반 | 2주 |
| **P0** | Diff Preview + Approval (Allow Once/Session) | UX 핵심 | 2주 |
| **P0** | Staleness Check + Doom Loop | 안전성 | 1주 |
| **P1** | Context Assembly (Tabs, @mention, Selection, Git) | 컨텍스트 품질 | 2주 |
| **P1** | Permission Levels (Ask/Accept/Auto/Bypass) | 안전성/생산성 | 1주 |
| **P1** | Checkpoint + Rollback UI | 복구성 | 1주 |
| **P1** | Auto-Lint/Test Post-Edit | 품질 | 1주 |
| **P1** | Context Compaction (4단계) | 장시간 세션 | 1주 |
| **P2** | Plan Mode (Questions → Mermaid → Approve) | 대형 작업 | 2주 |
| **P2** | Debug Mode (Instrument → Reproduce → Patch) | 버그 수정 | 2주 |
| **P2** | Side Chat | 병렬 탐색 | 1주 |
| **P2** | Context Compaction UI | 관찰성 | 1주 |
| **P3** | Best-of-N / Worktree | 고급 | 2주 |
| **P3** | Debug Mode (Browser) | 프론트엔드 | 2주 |
| **P3** | MCP Client | 생태계 | 2주 |
| **P3** | Browser/Design Mode | 프론트엔드 | 3주 |
| **P4** | Team Rules Sync / Skills | 협업 | 1주 |
| **P4** | Remote SSH / Dev Containers | 인프라 | 2주 |

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 3. References

- `PRD-C0_Chat_UI_Streaming.md` ~ `PRD-C7_Production_Grade.md` — 구현 단계별 상세
- `PRD-Harness-02_Verification_First.md` — 검증 우선 철학
- `PRD-07_Parallel_File_Search.md` — 병렬 읽기 구현체
- Cursor Docs: https://cursor.sh/docs
- Cursor Changelog: https://cursor.sh/changelog