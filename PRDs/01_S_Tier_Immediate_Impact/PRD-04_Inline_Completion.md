# PRD-04: 인라인 자동완성 (Inline Completion with Custom Model)

> **Priority**: S급 (매 키스트로크 체감)  
> **Phase**: 3 (C2 완료 후, 같은 엔드포인트 재사용)  
> **관련 PRD**: `PRD-Infra-21_Model_Router_Provider_Adapter.md`, `PRD-Spec-01_Provider_ToolJSON.md`

---

## 1. Overview

### 목적
에디터에서 타이핑할 때마다 **자체 모델(로컬 Flash 등)**이 실시간으로 코드 완성 제안을 띄워, Cursor의 "Tab 완성" 체감을 확장만으로 구현한다.

### 비즈니스 가치
- 매 키스트로크 즉시 체감 → 도입 장벽 최소화
- 채팅과 **동일 엔드포인트/모델** 재사용 → 인프라 중복 없음
- 로컬 모델로 프라이버시/비용 해결

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, 함수 시그니처 입력 시 바디 전체를 Tab으로 채우고 싶다 |
| US-02 | 개발자로서, 주석 작성 시 구현 코드가 자동 제안되길 원한다 |
| US-03 | 개발자로서, 내 DGX 모델로만 자동완성이 돌아가서 코드가 외부로 나가지 않게 하고 싶다 |

---

## 2. Functional Requirements

| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | `InlineCompletionItemProvider` 등록 | VS Code API로 프로바이더 등록, `provideInlineCompletionItems` 구현 |
| FR-02 | 트리거 조건 | 커서 위치 기준 앞뒤 200토큰, 최소 3자 입력 후, `triggerCharacters: ['.', '(', '[', '{', ':', '=']` |
| FR-03 | 스트리밍 완성 | 토큰 단위 스트리밍 → `InlineCompletionItem` 배열로 반환 (최대 3개 후보) |
| FR-04 | 수락/거부 UX | `Tab` 수락, `Esc` 거부, `Alt+]` 다음 후보, `Alt+[` 이전 후보 |
| FR-05 | 컨텍스트 구성 | 현재 파일 전체 + 열려 있는 탭 요약 + 커서 주변 ±100줄 |
| FR-06 | 모델 파라미터 | `temperature: 0.1`, `max_tokens: 256`, `stop: ['\n\n', '```']` |
| FR-07 | 지연 시간 예산 | 요청→첫 토큰 < 150ms (로컬), < 300ms (원격) — 초과 시 요청 취소 |
| FR-08 | 캐싱 | 동일 프리픽스 500ms 내 재요청 시 캐시된 결과 반환 |
| FR-09 | 비활성화 설정 | 언어별/전역 on/off, 특정 폴더 제외 (`node_modules`, `.git`) |
| FR-10 | 로깅/메트릭 | 수락률, 지연시간, 토큰 수 Telemetry 전송 (옵트인) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | P99 지연시간 | 로컬 200ms, 원격 500ms 이하 |
| NFR-02 | 메모리 | 프로바이더 인스턴스 < 50MB |
| NFR-03 | 배터리/리소스 | 유휴 시 요청 중단, 포커스 잃으면 2초 후 취소 |
| NFR-04 | 프라이버시 | 코드 조각이 로그/텔레메트리에 원문 저장 안 됨 (해시만) |

---

## 4. API & Technical Spec

### 4.1 VS Code Extension API

```typescript
// package.json 기여점
"contributes": {
  "inlineCompletions": [
    {
      "language": "*",                    // 모든 언어
      "selector": { "text": true },
      "provider": "agentK.inline"
    }
  ]
}

// 구현
export class AgentKInlineProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList> {
    // 1. 트리거 확인
    if (!this.shouldTrigger(document, position, context)) {
      return { items: [] };
    }

    // 2. 컨텍스트 구성
    const prompt = this.buildPrompt(document, position);
    
    // 3. 모델 스트리밍 호출 (동일 Provider 어댑터 재사용)
    const stream = this.provider.streamCompletion({
      model: this.config.inlineModel,
      prompt,
      temperature: 0.1,
      max_tokens: 256,
      stop: ['\n\n', '```'],
    }, token);

    // 4. 토큰 누적 → InlineCompletionItem 변환
    const items: vscode.InlineCompletionItem[] = [];
    for await (const chunk of stream) {
      items.push(new vscode.InlineCompletionItem(chunk.text, {
        range: new vscode.Range(position, position),
      }));
      if (items.length >= 3) break; // 최대 3개 후보
    }

    return { items };
  }

  private buildPrompt(doc: vscode.TextDocument, pos: vscode.Position): string {
    const prefix = doc.getText(new vscode.Range(
      doc.positionAt(Math.max(0, doc.offsetAt(pos) - 2000)),
      pos
    ));
    const suffix = doc.getText(new vscode.Range(
      pos,
      doc.positionAt(Math.min(doc.getText().length, doc.offsetAt(pos) + 500))
    ));
    
    // 열린 탭 요약 (최대 3개)
    const openTabs = vscode.window.visibleTextEditors
      .slice(0, 3)
      .map(e => `// ${e.document.fileName}\n${e.document.getText().slice(0, 500)}`)
      .join('\n\n');

    return `<|fim_prefix|>${openTabs}\n\n${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
  }
}
```

### 4.2 FIM (Fill-in-the-Middle) 포맷 지원
- DeepSeek/Qwen/CodeLlama 계열은 `<|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>` 템플릿 필요
- Provider 어댑터에서 모델별 템플릿 자동 적용 (`PRD-Infra-21_Model_Router_Provider_Adapter.md`)

### 4.3 설정 스키마

```json
{
  "agentK.inlineCompletion.enabled": true,
  "agentK.inlineCompletion.model": "deepseek-v4-flash",
  "agentK.inlineCompletion.maxTokens": 256,
  "agentK.inlineCompletion.temperature": 0.1,
  "agentK.inlineCompletion.debounceMs": 100,
  "agentK.inlineCompletion.excludeGlobs": ["**/node_modules/**", "**/.git/**"],
  "agentK.inlineCompletion.languages": ["*"],
  "agentK.inlineCompletion.showGhostText": true
}
```

---

## 5. UI/UX Specification

### 5.1 고스트 텍스트 렌더링
```
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)  // ← 회색 고스트 텍스트
}
```
- 색상: VS Code 테마 `editorInlineCompletion.foreground` (보통 `rgba(128,128,128,0.6)`)
- 수락 시: 일반 텍스트로 변환, undo 스택에 단일 편집으로 기록

### 5.2 후보 네비게이션
| 키 | 액션 |
|----|------|
| `Tab` | 현재 후보 수락 |
| `Esc` | 후보 숨김 |
| `Alt+]` / `Ctrl+Alt+Right` | 다음 후보 |
| `Alt+[` / `Ctrl+Alt+Left` | 이전 후보 |

### 5.3 상태 표시줄 아이콘
```
$(sparkle) Agent K Inline  [●]  ← 녹색: 활성, 회색: 비활성, 빨강: 에러
클릭 → 설정 패널 열기
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Inline Completion

  Scenario: Basic function completion
    Given a TypeScript file with "function add(a: number, b: number): number {"
    When cursor is at the opening brace
    Then ghost text appears suggesting "return a + b;}"
    When user presses Tab
    Then the suggestion is inserted as normal text

  Scenario: Comment-driven generation
    Given a Python file with "# TODO: implement binary search"
    When cursor is on next line
    Then ghost text suggests full binary search implementation
    And pressing Tab accepts it

  Scenario: Latency budget enforced
    Given local model takes 400ms to respond
    When inline completion is triggered
    Then request is cancelled at 300ms
    And no ghost text appears (silent fallback)

  Scenario: Cancellation on typing
    Given a completion request is in flight
    When user types another character
    Then previous request is aborted via CancellationToken
    And new request starts with updated prefix

  Scenario: Disabled for excluded folders
    Given "agentK.inlineCompletion.excludeGlobs" includes "**/vendor/**"
    When editing a file under "vendor/"
    Then no inline completion requests are made
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-21_Model_Router_Provider_Adapter.md` | 선행 | 스트리밍 완성 엔드포인트, FIM 템플릿 |
| `PRD-Spec-01_Provider_ToolJSON.md` | 선행 | 모델 응답 파싱 정규화 |
| `PRD-02_Local_LLM_Provider.md` | 병행 | DGX/Ollama 엔드포인트 설정 |
| `PRD-Infra-03_Indexing_SemanticSearch.md` | 후속 | @codebase 컨텍스트 주입 시 품질 향상 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | `InlineCompletionItemProvider` 스캐폴드 + 기본 프롬프트 | 고스트 텍스트 표시 |
| 2 | FIM 템플릿 per 모델 + Provider 어댑터 연동 | DeepSeek/Qwen/CodeLlama 지원 |
| 3 | 디바운스/취소/캐싱 + 지연 예산 강제 | P99 < 200ms (로컬) |
| 4 | 설정 UI + 언어별 on/off + 제외 글로브 | 사용자 커스터마이징 |
| 5 | 수락률/지연 메트릭 텔레메트리 (옵트인) | 제품 개선 데이터 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 로컬 모델 지연으로 타이핑 방해 | 높음 | 하드 타임아웃(150ms) + 비동기 취소, 실패 시 조용히 무시 |
| FIM 템플릿 미지원 모델에서 품질 저하 | 중간 | 템플릿 없는 모델은 prefix-only 모드로 폴백, 품질 경고 로그 |
| 메모리 누적 (스트림 미완료) | 낮음 | `CancellationToken` 연동 필수, 2초 후 강제 정리 |
| 제안이 기존 코드와 중복/충돌 | 중간 | `range`를 커서 위치로 한정, 중복 감지 시 후보 필터링 |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: 인라인 자동완성 (자체 모델)**
- VS Code Inline Completion API: https://code.visualstudio.com/api/extension-guides/inline-completion
- FIM (Fill-in-the-Middle) 논문: https://arxiv.org/abs/2207.14255