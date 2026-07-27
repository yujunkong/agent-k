# PRD-C6: Debug 모드 (Debug Mode - 런타임 증거 기반 수정)

> **Phase**: C6 (C5 Plan 모드 안정화 후)  
> **Priority**: 높음 (프론트엔드/복잡 버그 해결력)  
> **관련 PRD**: `PRD-C5_Plan_Mode.md`, `PRD-Tools-G_Debug_Tools.md`, `PRD-Harness-10_Verification_MicroLoop.md`, `PRD-11_Browser_Design_Mode.md` (C7)

---

## 1. Overview

### 목적
Cursor Debug Mode와 동등한 **"가설 → 계측 → 재현 → 로그 분석 → 최소 패치 → 검증 → 계측 제거"** 루프를 구현한다. 추측으로 고치지 않고 **런타임 증거(로그, 스택, 스크린샷)**로 원인 특정 후 최소 수정한다.

### 비즈니스 가치
- **간헐적 버그 해결**: "가끔 500 에러" → 계측 → 재현 → 원인 특정
- **프론트엔드 디버깅**: 브라우저 콘솔/네트워크/스크린샷으로 런타임 증거 수집 (풀 Design Mode UI는 **C7 / `PRD-11`**)
- **중급 모델 보호**: Flash가 "여기가 원인일 거야" 추측 패치 못 하게 강제

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "간헐적 500 에러 잡아줘" 하면 계측 코드 넣고 재현 기다렸다가 로그 보고 최소 패치해주길 원한다 |
| US-02 | 프론트엔드 개발자로서, "버튼 클릭하면 화면 깨짐" 하면 브라우저 스크린샷·콘솔로 증거 모으고, UI 주석 수정은 C7 Design Mode(`PRD-11`)로 이어가고 싶다 |
| US-03 | 팀 리더로, Debug 모드 로그가 자동 저장돼서 사후 분석/문서화 가능하게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 Debug 모드 전용 도구
| 도구 | 기능 | 비고 |
|------|------|------|
| `add_instrumentation` | 가설 검증용 로그/메트릭/트레이스 삽입 | `edit_file` 래퍼, 계측 마커 자동 추가 |
| `collect_runtime_logs` | 로컬 디버그 서버/파일에서 로그 수집 | 파일 tail, journald, 커스텀 소켓 |
| `request_reproduce` | 사용자에게 재현 요청 (가이드 + 대기) | 모달 + "Reproduced" 버튼 |
| `remove_instrumentation` | 수정 확정 후 계측 코드 자동 제거 | `edit_file`로 계측 마커 구간 삭제 |
| `browser_*` | 브라우저 네비게이션/스크린샷/클릭 (디버그 증거) | Playwright; **Design Mode 본구현은 C7/`PRD-11`** |
| `read_lints` / `run_terminal_cmd` | 수정 후 검증 | 동일 |

### 2.2 Debug 루프 상세
```
가설 수립 (N개)
  → 계측 로그 삽입 (add_instrumentation)
  → 사용자 재현 요청 (request_reproduce) → 대기
  → 로그 수집 (collect_runtime_logs)
  → 로그 분석 → 원인 특정
  → 최소 패치 (edit_file)
  → 재현으로 검증 (request_reproduce + collect)
  → 계측 코드 제거 (remove_instrumentation)
```

### 2.3 가설 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 가설 기록 | `todo_write`로 가설 목록 관리 (상태: pending/investigating/confirmed/rejected) |
| FR-02 | 계측 마커 | 삽입 코드에 `// DEBUG_INSTRUMENT: hypothesis-1` 주석 자동 추가 |
| FR-03 | 재현 대기 | 사용자 액션까지 무제한 대기 (타임아웃 5분 → 알림) |
| FR-04 | 로그 필터링 | 가설 관련 로그만 추출 (파일/함수/타임스탬프 범위) |
| FR-05 | 원인 확정 임계값 | 스택 트레이스 일치 + 재현 로그 + failing symbol 3가지 중 2개 이상 일치 시 "확정" |

### 2.4 Design Mode 연계 (참고 — 본구현은 C7)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | C6 범위 | 디버그용 `browser_screenshot` / 콘솔·네트워크 수집까지 |
| FR-02 | C7 이관 | 캔버스 오버레이·주석·셀렉터 추출은 `PRD-11` / C7 |
| FR-03 | 수정 후 재캡처 | C6에서는 스크린샷 재촬영으로 검증; Design Mode 주석은 C7 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 재현 대기 타임아웃 | 5분 (설정 가능), 이후 "아직 재현 안 됨" 알림 |
| NFR-02 | 계측 삽입/제거 정확도 | 마커 기반 100% 제거 (잔여 코드 0줄) |
| NFR-03 | 브라우저 세션 메모리 | 세션당 < 300MB, 자동 정리 |
| NFR-04 | 재현 대기 중 UI 반응성 | 채팅 입력 가능, 다른 탭 전환 가능 |

---

## 4. Technical Spec

### 4.1 Debug 전용 도구 구현 (`src/tools/debugTools.ts`)

```typescript
export interface DebugHypothesis {
  id: string;
  description: string;
  status: 'pending' | 'investigating' | 'confirmed' | 'rejected';
  instrumentationIds: string[];
  evidence: Evidence[];
}

export interface Instrumentation {
  id: string;
  hypothesisId: string;
  filePath: string;
  range: Range;
  originalCode: string;
  instrumentedCode: string;  // 로그/메트릭/트레이스 추가된 코드
  marker: string;  // "// DEBUG_INSTRUMENT: hypothesis-1"
}

export const DEBUG_TOOLS = {
  add_instrumentation: {
    name: 'add_instrumentation',
    description: 'Insert logging/metrics/tracing for hypothesis verification',
    parameters: {
      type: 'object',
      properties: {
        hypothesisId: { type: 'string' },
        filePath: { type: 'string' },
        range: { startLine: 'number', endLine: 'number' },
        instrumentationType: { enum: ['log', 'metric', 'trace', 'snapshot'] },
        logTemplate: { type: 'string', description: 'e.g., "ENTER fn args={args}"' },
      },
      required: ['hypothesisId', 'filePath', 'range', 'instrumentationType'],
    },
  },

  collect_runtime_logs: {
    name: 'collect_runtime_logs',
    description: 'Collect logs from debug server / file / journald',
    parameters: {
      type: 'object',
      properties: {
        source: { enum: ['file', 'socket', 'journald', 'custom'], default: 'file' },
        path: { type: 'string' },
        filter: { type: 'string', description: 'regex or keyword' },
        since: { type: 'number', description: 'timestamp ms' },
        until: { type: 'number' },
        maxLines: { type: 'number', default: 1000 },
      },
      required: ['source'],
    },
  },

  request_reproduce: {
    name: 'request_reproduce',
    description: 'Ask user to reproduce the issue and click "Reproduced"',
    parameters: {
      type: 'object',
      properties: {
        hypothesisId: { type: 'string' },
        instructions: { type: 'string', description: 'Steps to reproduce' },
        timeoutMs: { type: 'number', default: 300000 },
      },
      required: ['hypothesisId', 'instructions'],
    },
  },

  remove_instrumentation: {
    name: 'remove_instrumentation',
    description: 'Remove all instrumentation code for a hypothesis',
    parameters: {
      type: 'object',
      properties: {
        hypothesisId: { type: 'string' },
        confirm: { type: 'boolean', default: true },
      },
      required: ['hypothesisId'],
    },
  },
};
```

### 4.2 계측 삽입/제거 엔진 (`src/debug/instrumentation.ts`)

```typescript
export class InstrumentationEngine {
  private instrumentations = new Map<string, Instrumentation>();

  async add(inst: Instrumentation): Promise<void> {
    // 1. 원본 코드 읽기
    const doc = await vscode.workspace.openTextDocument(inst.filePath);
    const original = doc.getText(new vscode.Range(inst.range.start, inst.range.end));
    
    // 2. 계측 코드 생성
    const instrumented = this.buildInstrumentedCode(original, inst);
    
    // 3. 마커 주석 추가
    const marked = `${instrumented}\n// DEBUG_INSTRUMENT: ${inst.marker}`;
    
    // 4. Diff 생성 (Search-Replace)
    const hunk: SearchReplaceHunk = {
      search: original,
      replace: marked,
      filePath: inst.filePath,
    };
    
    // 5. PatchApplier로 적용 (C2와 동일)
    await patchApplier.apply([hunk]);
    
    // 6. 레지스트리 저장
    this.instrumentations.set(inst.id, { ...inst, originalCode: original, instrumentedCode: marked });
  }

  async remove(hypothesisId: string): Promise<void> {
    const insts = Array.from(this.instrumentations.values()).filter(i => i.hypothesisId === hypothesisId);
    
    for (const inst of insts) {
      const doc = await vscode.workspace.openTextDocument(inst.filePath);
      const content = doc.getText();
      
      // 마커 기준으로 계측 코드 구간 찾아 원본으로 복원
      const markerRegex = new RegExp(`// DEBUG_INSTRUMENT: ${inst.marker}`);
      const match = markerRegex.exec(content);
      if (!match) continue;
      
      // 계측된 블록 찾아 원본으로 치환
      const range = this.findInstrumentedRange(content, inst.marker);
      if (range) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(vscode.Uri.file(inst.filePath), range, inst.originalCode);
        await vscode.workspace.applyEdit(edit);
      }
    }
    
    // 레지스트리에서 제거
    insts.forEach(i => this.instrumentations.delete(i.id));
  }

  private buildInstrumentedCode(original: string, inst: Instrumentation): string {
    switch (inst.instrumentationType) {
      case 'log':
        return `${original}\nconsole.log('[DEBUG:${inst.marker}] ${inst.logTemplate}');`;
      case 'metric':
        return `${original}\nmetrics.increment('${inst.marker}');`;
      case 'trace':
        return `const span = tracer.startSpan('${inst.marker}');\n${original}\nspan.end();`;
      case 'snapshot':
        return `${original}\ndebug.snapshot({ hypothesis: '${inst.hypothesisId}', state: getCurrentState() });`;
      default:
        return original;
    }
  }
}
```

### 4.3 재현 대기 UI (`src/views/reproduceRequest.ts`)

```html
<!-- Reproduce Request Modal -->
<div class="reproduce-modal">
  <div class="header">
    <h3>🔬 Reproduce Issue for Hypothesis #{{hypothesisId}}</h3>
    <span class="timer" id="timer">5:00</span>
  </div>
  <div class="instructions">
    <h4>Steps to reproduce:</h4>
    <ol>{{#each instructions}}<li>{{this}}</li>{{/each}}</ol>
  </div>
  <div class="status">
    <div class="spinner"></div>
    <span>Waiting for reproduction... (Debug logs streaming)</span>
  </div>
  <div class="live-logs" id="liveLogs">
    <!-- 실시간 로그 스트리밍 -->
  </div>
  <div class="actions">
    <button id="reproducedBtn" class="primary" disabled>✅ Reproduced</button>
    <button id="skipBtn" class="secondary">⏭ Skip (Cannot reproduce)</button>
    <button id="cancelBtn" class="danger">❌ Cancel Debug</button>
  </div>
</div>
```

```typescript
// 실시간 로그 스트리밍 + 재현 버튼 활성화
export class ReproduceRequestUI {
  private websocket: WebSocket;
  private timer: number;

  async show(hypothesis: DebugHypothesis): Promise<ReproduceResult> {
    return new Promise(resolve => {
      this.panel = vscode.window.createWebviewPanel('reproduceRequest', `Reproduce: ${hypothesis.id}`, vscode.ViewColumn.One);
      this.panel.webview.html = this.getHtml(hypothesis);
      
      // 실시간 로그 스트리밍 시작
      this.startLogStream(hypothesis.id);
      
      // 타이머
      this.timer = setTimeout(() => this.enableReproducedBtn(), 5000); // 5초 후 활성화
      
      this.panel.webview.onDidReceiveMessage(msg => {
        if (msg.type === 'reproduced') resolve({ reproduced: true, logs: this.capturedLogs });
        if (msg.type === 'skip') resolve({ reproduced: false, reason: 'User skipped' });
        if (msg.type === 'cancel') resolve({ reproduced: false, reason: 'User cancelled' });
      });
    });
  }
}
```

### 4.4 Debug 모드 에이전트 루프 (`src/agent/debugAgent.ts`)

```typescript
export class DebugAgent {
  private hypotheses: DebugHypothesis[] = [];
  private currentHypothesisIndex = 0;

  async run(goal: string): Promise<void> {
    // 1. 가설 수립 (LLM이 N개 생성)
    this.hypotheses = await this.generateHypotheses(goal);
    
    for (let i = 0; i < this.hypotheses.length; i++) {
      this.currentHypothesisIndex = i;
      const hyp = this.hypotheses[i];
      
      // 2. 계측 삽입
      await this.instrument(hyp);
      
      // 3. 재현 요청
      const reproduce = await this.requestReproduce(hyp);
      if (!reproduce.reproduced) {
        hyp.status = 'rejected';
        await this.cleanup(hyp);
        continue;
      }
      
      // 4. 로그 수집 + 분석
      const logs = await this.collectLogs(hyp);
      const analysis = await this.analyzeLogs(hyp, logs);
      
      // 5. 원인 확정 시 최소 패치
      if (analysis.confirmed) {
        await this.applyMinimalPatch(analysis.rootCause);
        
        // 6. 검증 (재현 재요청)
        const verify = await this.requestReproduce(hyp);
        if (verify.reproduced) {
          // 여전히 실패 → 패치 실패 → 다른 접근
        } else {
          // 성공 → 계측 제거 → 완료
          await this.cleanup(hyp);
          return;
        }
      }
    }
    throw new Error('All hypotheses exhausted');
  }
}
```

---

## 4. UI/UX Specification

### 4.1 Debug 세션 패널
```
┌─ Debug Session: "Intermittent 500 on /api/checkout" ────────────────────┐
│  Hypotheses: 3  |  Current: #2 (Investigating)  |  [Stop Debug]         │
├──────────────────────────────────────────────────────────────────────────┤
│ 🟢 #1: DB connection pool exhaustion    → Rejected (logs show pool OK)  │
│ 🟡 #2: Race condition in payment lock   → 🔍 Investigating...           │
│    Instrumentation: 3 points (payment.ts:45, order.ts:12, lock.ts:8)   │
│    Status: ⏳ Waiting for reproduction...  [Reproduced] [Skip] [Cancel] │
│    Live Logs:                                                            │
│    [14:32:01.234] DEBUG:hyp-2: acquireLock(order-123)                  │
│    [14:32:01.235] DEBUG:hyp-2: lock acquired by worker-7               │
│    [14:32:01.236] DEBUG:hyp-2: acquireLock(order-123) BLOCKED          │
│    [14:32:01.237] DEBUG:hyp-2: lock acquired by worker-3 (RACE!)       │
│ ──────────────────────────────────────────────────────────────────────  │
│ 🔴 #3: External API timeout            → Pending                       │
├──────────────────────────────────────────────────────────────────────────┤
│ Evidence for #2:                                                        │
│   ✅ Stack trace matches: lock.ts:12 → acquireLock                     │
│   ✅ Reproduction log: two workers acquired same lock                  │
│   ⚠️ Failing symbol: payment.ts:45 (checkout)                          │
│   → Confidence: HIGH → Ready for minimal patch                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Design Mode (참고 — 본구현은 C7 / `PRD-11`)
C6는 디버그용 스크린샷·콘솔 증거만. 아래 오버레이 UI는 **C7 Design Mode** 스케치이며 C6 체크리스트에 포함하지 않는다.
```
┌─ Design Mode (C7): https://app.example.com/checkout ────────────────────┐
│  [Rect] [Arrow] [Text]  Color: 🔴  [Extract Selector]  [Done]          │
│  … (캔버스 주석 UI — PRD-11) …                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Debug Mode

  Scenario: Hypothesis instrumentation and reproduction
    Given user runs "/debug Intermittent 500 on checkout"
    When agent generates 3 hypotheses
    And selects hypothesis #2 "Race condition in payment lock"
    Then instrumentation added to 3 files with DEBUG_INSTRUMENT markers
    And reproduce request modal shown with instructions
    When user clicks "Reproduced" after triggering bug
    Then logs collected and analyzed
    And root cause identified with HIGH confidence
    And minimal patch applied (edit_file)
    And verification reproduce requested
    When user confirms fix works
    Then instrumentation automatically removed
    And debug session ends with summary

  Scenario: Browser evidence for UI bug (Design Mode UI is C7)
    Given user reports "Button color wrong on mobile"
    When agent opens browser, navigates to page
    And captures screenshot and console/network logs
    Then evidence injected as debug context
    And agent applies minimal CSS patch
    And browser re-navigates and re-captures for verification
    # Full Design Mode overlay/annotation belongs to PRD-11 / C7

  Scenario: Instrumentation cleanup on cancel
    Given debug session with 5 instrumentation points
    When user clicks "Cancel Debug"
    Then all 5 instrumentation blocks removed automatically
    And no DEBUG_INSTRUMENT markers remain in codebase

  Scenario: Hypothesis rejection flows to next
    Given hypothesis #1 rejected (evidence contradicts)
    When agent marks rejected
    Then instrumentation removed
    And hypothesis #2 automatically selected
    And todo_write updated
```

---

## 6. Implementation Checklist

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | Debug 전용 도구 4종 등록 + 스키마 | ToolRegistry에 등록, 스키마 검증 통과 |
| 2 | InstrumentationEngine (삽입/제거/마커) | 마커 기반 100% 제거 검증 |
| 3 | ReproduceRequest UI + 실시간 로그 스트리밍 | 5분 타임아웃, 재현 버튼 활성화 |
| 4 | DebugAgent 루프 (가설→계측→재현→분석→패치→검증→정리) | 3가설 시나리오 E2E 통과 |
| 5 | 브라우저 스크린샷/콘솔 증거 수집 (Design Mode UI는 C7) | 세션당 < 300MB, 자동 정리 |
| 6 | Evidence 기반 확정 임계값 로직 | 스택+재현+심볼 2/3 매칭 → 확정 |
| 7 | 통합 E2E: 간헐적 버그 → 패치 → 검증 → 정리 | CI 그린 |

---


## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## 7. References

- `PRD-C5_Plan_Mode.md` — 큰 작업은 Plan 모드로 먼저 계획
- `PRD-Tools-G_Debug_Tools.md` — Debug 전용 계측·재현·로그 도구
- `PRD-Harness-10_Verification_MicroLoop.md` — 검증 루프
- `PRD-11_Browser_Design_Mode.md` — Design Mode 본구현 (C7)
- `PRD-Harness-10_Verification_MicroLoop.md` — 수정 후 자동 검증 루프
- Cursor Debug Mode: https://cursor.sh/docs/debug-mode
- Playwright: https://playwright.dev/docs/api/class-browser