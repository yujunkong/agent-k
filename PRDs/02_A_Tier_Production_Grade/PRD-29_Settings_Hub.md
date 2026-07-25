# PRD-29: 설정 허브 (Settings Hub)

> **Priority**: A급 (제품 노브 — Cursor Settings급)  
> **Phase**: C0 뼈대 → C2 Permission → C3~C4 Queue/Harness → C4+ Context/MCP → C7 Features  
> **관련 PRD**: `PRD-21_Secrets_Config_Vault.md`, `PRD-Infra-17_Extension_Lifecycle_Config.md`, `PRD-17_Message_Queue.md`, `PRD-Spec-05_Permission_Autorun.md`, `PRD-Harness-06_A_Tier_Whitelist.md`  
> **원본**: `Extension_high_impact.md` — **「설정 (Settings Hub)」** 절  
> **Canonical**: 설정 **UX·카테고리·기본값** Primary = 본 문서. `agent-k.*` 스키마 등록 = Infra-17. 시크릿 값 저장 = PRD-21.

---

## 1. Overview

### 목적
모델·권한·메시지 큐·하네스·인덱스·MCP·기능 토글을 **한곳**에서 관리한다.  
VS Code 기본 Settings(`agent-k.*`)와 **설정 Webview**(카테고리 탭)이 **동일 값**을 본다.

### 비즈니스 가치
- Cursor 사용자가 기대하는 Settings 체감
- 중급 하네스·Queue Resynthesize 등을 하드코딩하지 않음
- 팀: allowlist/deny는 Workspace 공유, API 키는 각자 SecretStorage

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 채팅 ⚙ 또는 명령으로 설정 허브를 열고 모델을 바꾸고 싶다 |
| US-02 | Enter=중단·종합·재시작을 설정에서 확인하고 싶다 |
| US-03 | Permission 영구 Always가 재시작 후에도 남았으면 한다 |
| US-04 | 워크스페이스에 터미널 allowlist만 커밋해 팀과 공유하고 싶다 (키 제외) |

---

## 2. Functional Requirements

### 2.1 진입점
| FR-ID | 요구사항 |
|-------|----------|
| FR-01 | 명령 `agent-k.openSettings` → 설정 Webview |
| FR-02 | VS Code Settings 검색 `agent-k` 로 동일 키 노출 |
| FR-03 | 채팅 헤더 ⚙ · 상태바 클릭 → 허브 또는 자주 쓰는 노브 |
| FR-04 | User / Workspace / Folder 계층 (VS Code 표준) |
| FR-05 | API 키는 SecretStorage만 (PRD-21) — settings.json 평문 금지 |

### 2.2 카테고리 탭 (원본 맵)
| 탭 | 내용 | 상세 PRD |
|----|------|----------|
| Models / Providers | Base URL, 모델, Tier, 라우터, 연결 테스트 | PRD-02, 21, 23 |
| Secrets | 키 입력·회전·삭제 (마스킹) | PRD-21 |
| Rules | rules glob, 미리보기 | Infra-01, PRD-15 |
| Agent / Modes | 기본 모드, 컨텍스트 리셋, maxTurns | PRD-03, C0~C6 |
| Permission | ask / accept_edits / auto / bypass · allowlist · deny | Spec-05, Infra-05 |
| Message Queue | Enter=`resynthesize` 기본 · Queue-only · Stop 시 keep/discard | PRD-17 |
| Review / Checkpoint | apply 정책 · auto checkpoint | PRD-09, Spec-06 |
| Harness | Tier A whitelist · optional search · prefetch · lint-fix | Harness-06/09/10 |
| Context / Index | 예산 · readMaxLines · indexing | Spec-03, PRD-08 |
| Tools / MCP | 도구 토글 · MCP 서버 | Tools, PRD-10 |
| Terminal | timeout · deny | Spec-04 |
| Privacy | telemetry · 마스킹 | Infra-16 |
| Features | Inline · Side · Browser · Skills · B급 패널 | C4~C7, PRD-28 |

### 2.3 권장 기본값 (원본 표)
| 키 | 기본 |
|----|------|
| `agent-k.modelTier` | `A` |
| `agent-k.permission.level` | `accept_edits` |
| `agent-k.queue.onEnterWhileRunning` | `resynthesize` |
| `agent-k.queue.onStop` | `keep` |
| `agent-k.queue.resynthesizeDebounceMs` | `300` |
| `agent-k.harness.verificationMicroLoop` | `true` |
| `agent-k.harness.aTierOptionalSearch` | `false` |
| `agent-k.context.readMaxLines` | `250` |
| `agent-k.maxTurns.A` | `15` |
| `agent-k.maxTurns.B` | `25` |

### 2.4 동기화
| FR-ID | 요구사항 |
|-------|----------|
| FR-20 | Webview 변경 → `workspace.getConfiguration().update` |
| FR-21 | `onDidChangeConfiguration` → 루프/큐/하네스 즉시 반영 (재시작 최소화) |
| FR-22 | 스키마 export (값·시크릿 제외) — 팀 공유용 JSON |

---

## 3. Non-Functional Requirements

| NFR-ID | 목표 |
|--------|------|
| NFR-01 | 설정 패널 첫 페인트 < 300ms |
| NFR-02 | 시크릿 필드 로그·텔레메트리 마스킹 |
| NFR-03 | Webview와 Settings UI 값 불일치 0 (단일 ConfigManager) |

---

## 4. API & Technical Spec

```typescript
// 의도: 설정 허브 ↔ VS Code configuration 단일 소스
export type QueueEnterMode = 'resynthesize' | 'queue_only';

export interface AgentKSettings {
  modelTier: 'A' | 'B' | 'C';
  permission: { level: 'ask' | 'accept_edits' | 'auto' | 'bypass' };
  queue: {
    onEnterWhileRunning: QueueEnterMode;
    onStop: 'keep' | 'discard';
    resynthesizeDebounceMs: number;
  };
  harness: {
    verificationMicroLoop: boolean;
    aTierOptionalSearch: boolean;
    enablePrefetch: boolean;
  };
  context: { readMaxLines: number; tokenBudget: number };
  maxTurns: { A: number; B: number };
}

export class ConfigManager {
  /** Webview·루프가 동일 객체 구독 */
  get(): AgentKSettings;
  update(partial: DeepPartial<AgentKSettings>, target: vscode.ConfigurationTarget): Thenable<void>;
  onChange(listener: (s: AgentKSettings) => void): vscode.Disposable;
}
```

스키마 등록 본문은 `PRD-Infra-17` `contributes.configuration`에 둔다 (중복 정의 금지 — 본 PRD는 UX·기본값·탭).

---

## 5. UI/UX Specification

```
┌─ Agent-K Settings ─────────────────────────────────────────┐
│ Models  Permission  Queue  Harness  Context  MCP  Privacy  │
├────────────────────────────────────────────────────────────┤
│ Message Queue                                              │
│  ● Interrupt & Resynthesize on Enter (Cursor)              │
│  ○ Queue only on Enter                                     │
│  On Stop: ● Keep queue  ○ Discard                          │
│  Debounce: 300ms                                           │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

- [ ] Webview와 `agent-k.*` Settings가 동일 값
- [ ] API 키 settings.json에 없음
- [ ] Queue Enter 모드 전환 후 실행 중 Enter 동작이 바뀜
- [ ] Permission 영구 Always가 User 설정에 유지
- [ ] Workspace allowlist 커밋 가능 · 시크릿 미포함

---

## 7. Dependencies

| PRD | 관계 |
|-----|------|
| Infra-17 | configuration 스키마 · ConfigManager |
| PRD-21 | Secrets 탭 구현 |
| PRD-17 | Queue 탭 동작 |
| Spec-05 / Infra-05 | Permission 탭 |
| Harness-06 | Harness 탭 |
| C0 | Open Settings 명령 · 헤더 ⚙ |

---

## 8. Implementation Phases

| 단계 | 범위 |
|------|------|
| C0 | Models + Secrets + Open Settings + ConfigManager |
| C2 | Permission 최소 |
| C3~C4 | Queue · maxTurns · Harness · Checkpoint |
| C4+ | Context · Index · MCP |
| C7 | Features 토글 |

---

## Out of Scope

- Cloud 팀 Settings SaaS / 강제 배포
- Cursor 네이티브 Settings 애니메이션 복제
- Team MCP 마켓 풀 제품

## References

- `Extension_high_impact.md` — 설정 (Settings Hub)
- `PRD-21` · `PRD-Infra-17` · `PRD-17`
