# PRD-26: MISRA/린트 AI 설명 (MISRA / Lint AI Explanation)

> **Priority**: B급 (컴플라이언스 보조)  
> **Phase**: C5~C6  
> **관련 PRD**: `PRD-Tools-A_Search_Explore.md`, `PRD-Tools-D_Web_Browser_Media.md` (`read_lints`), `PRD-Harness-10_Verification_MicroLoop.md`

---

## 1. Overview

### 목적
**MISRA C/C++, AUTOSAR, CERT, CWE** 등 정적 분석 규칙 위반 시, 단순한 규칙 ID·라인 번호만 보여주는 대신 **"왜 문제인지, 어떻게 고치는지, 예외 처리 가능한지"**를 자연어로 설명해준다. 컴파일러/린터 출력 → LLM 프롬프트 → 개발자 친화적 설명 카드.

### 비즈니스 가치
- **컴플라이언스 비용 절감**: 주니어도 시니어급 설명 읽고 바로 수정
- **거짓 양성(False Positive) 판별**: "이건 예외 사유로 허용 가능" 자동 제안
- **감사 대응**: "이 위반은 이렇게 완화했다" 문서 자동 생성

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 임베디드 엔지니어로, `MISRA C 2012 Rule 10.3` 위반 뜨면 "부호 없는 정수에 부호 있는 값 암시적 변환 → 오버플로 위험" 설명과 수정 코드(`static_cast<uint32_t>`) 바로 보고 싶다 |
| US-02 | 팀 리더로, 전체 프로젝트 MISRA 위반 200건 중 "예외 처리 가능 120건, 실제 수정 필요 80건" 자동 분류돼 리뷰 시간 줄이고 싶다 |
| US-03 | 감사관으로, "Rule 15.5 위반 3건은 예외 처리 승인서 2024-03-15로 완화함" 문서 자동 생성돼 감사 통과 쉽게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 린트/정적 분석 연동
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 다중 도구 지원 | `cppcheck`, `clang-tidy`, `pc-lint`, `misra-checker`, `sonarqube`, `coverity` 출력 파싱 |
| FR-02 | 표준 포맷 입력 | SARIF, JSON, XML, 텍스트 로그 모두 수용 |
| FR-03 | VS Code Diagnostics 연동 | `languages.getDiagnostics()`로 실시간 에디터 스퀴글과 동기화 |
| FR-04 | 빌드 시스템 연동 | CMake/Make/Ninja 컴파일 커맨드에서 `compile_commands.json` 추출 → clang-tidy 실행 |

### 2.2 AI 설명 생성
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 규칙 설명 | 규칙 ID → 공식 문서 요약 + 위반 시 런타임 동작(UB, 오버플로, 보안) |
| FR-06 | 컨텍스트 인식 | 주변 코드(±10줄) + 타입 정보(`compile_commands.json`) 포함해 프롬프트 구성 |
| FR-07 | 수정 제안 | 최소 변경 Diff(Search-Replace) + 이유 설명 |
| FR-08 | 예외 사유 판단 | "이 위반은 Rule 10.3 예외 3호(비트필드 조작) 해당 → `// misra-exception: rule-10.3` 주석으로 완화 가능" |
| FR-09 | 다국어 | 한국어/영어 전환 (설정) |

### 2.3 UI/UX
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-10 | 설명 카드 | 진단 호버/클릭 → 사이드 패널에 설명 카드 렌더링 |
| FR-11 | 일괄 리뷰 뷰 | "전체 위반 리뷰" 패널: 필터(심각도, 규칙, 파일), 일괄 승인/수정 |
| FR-12 | 예외 주석 자동 삽입 | "예외 처리 승인" 클릭 → `// misra-exception: rule-10.3 rationale: bitfield manipulation` 자동 삽입 |
| FR-13 | 감사 리포트 | 승인된 예외 목록 + 근거 + 승인자/날짜 → Markdown/PDF 내보내기 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 설명 생성 지연 | 로컬 Flash 모델 기준 < 2초/위반 |
| NFR-02 | False Positive 분류 정확도 | 예외 가능 위반 90% 이상 정확히 식별 |
| NFR-03 | 오프라인 동작 | 로컬 모델로 완전 동작, 외부 API 불필요 |
| NFR-04 | 대량 위반 처리 | 1000건 위반 배치 처리 < 5분 |

---

## 4. API & Technical Spec

### 4.1 진단 → 설명 파이프라인 (`src/compliance/explainer.ts`)

```typescript
export interface LintDiagnostic {
  file: string;
  range: Range;
  severity: 'error' | 'warning' | 'info';
  code: string;                    // 'misra-cpp-2008-10.3'
  tool: 'cppcheck' | 'clang-tidy' | 'pc-lint' | 'sonarqube';
  message: string;                 // 원본 메시지
  relatedInfo?: DiagnosticRelatedInfo[];
}

export interface ExplanationCard {
  diagnostic: LintDiagnostic;
  rule: RuleMetadata;
  explanation: string;             // 자연어 설명
  risk: 'critical' | 'high' | 'medium' | 'low';
  fix?: SearchReplacePatch;        // 수정 제안
  exception?: ExceptionInfo;       // 예외 가능 여부
  references: string[];            // 공식 문서/블로그 링크
}

export interface RuleMetadata {
  id: string;                      // 'misra-cpp-2008-10.3'
  standard: 'misra-c' | 'misra-cpp' | 'autosar' | 'cert' | 'cwe';
  title: string;                   // 'Implicit conversion changes signedness'
  category: 'type' | 'control' | 'memory' | 'concurrency' | 'security';
  description: string;             // 공식 문서 요약
  rationale: string;               // 왜 중요한지
  exceptions: ExceptionRule[];     // 허용 예외 조항
}

export interface ExceptionRule {
  clause: string;                  // 'Exception 3'
  condition: string;               // 'Bitfield manipulation'
  example: string;                 // 코드 예시
  waiverTemplate: string;          // '// misra-exception: rule-10.3 rationale: bitfield'
}

export class ComplianceExplainer {
  constructor(
    private llm: LLMProvider,
    private ruleDB: RuleDatabase,
    private compileDB: CompileCommandsDB
  ) {}

  async explain(diag async explainBatch(diagnostics: LintDiagnostic[]): Promise<ExplanationCard[]> {
    // 1. 규칙 메타데이터 조인
    const enriched = diagnostics.map(d => ({
      ...d,
      rule: this.ruleDB.get(d.code),
      context: await this.extractContext(d),
    }));

    // 2. 배치 프롬프트 구성 (최대 10개씩)
    const batches = chunk(enriched, 10);
    const results: ExplanationCard[] = [];

    for (const batch of batches) {
      const prompt = this.buildPrompt(batch);
      const response = await this.llm.chatCompletion({
        model: 'deepseek-v4-flash',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      results.push(...this.parseResponse(response, batch));
    }
    return results;
  }

  private buildPrompt(batch: EnrichedDiagnostic[]): string {
    return `Explain the following static analysis violations for an embedded C++ engineer.

CONTEXT: MISRA C++ 2008 / AUTOSAR C++14 compliance.

For EACH violation, output JSON with:
- explanation: 2-3 sentences (what, why risky, runtime behavior)
- risk: critical|high|medium|low
- fix: Search-Replace diff (if straightforward)
- exception: { applicable: boolean, clause: string, waiverComment: string }
- references: [urls]

VIOLATIONS:
${batch.map((d, i) => `${i+1}. [${d.code}] ${d.file}:${d.range.start.line}
\`\`\`cpp
${d.context.codeSnippet}
\`\`\`
Rule: ${d.rule?.title || 'Unknown'}
Current: ${d.message}
`).join('\n\n')}`;
  }
}
```

### 4.2 규칙 데이터베이스 (`src/compliance/rulesDB.ts`)

```typescript
// rules/misra-cpp-2008.json (일부)
{
  "misra-cpp-2008-10.3": {
    "id": "misra-cpp-2008-10.3",
    "standard": "misra-cpp",
    "title": "Implicit conversion changes signedness",
    "category": "type",
    "description": "The value of an expression shall not be implicitly converted to a different signedness.",
    "rationale": "Implicit signed/unsigned conversion can cause unexpected wrap-around, overflow, or comparison bugs.",
    "exceptions": [
      { "clause": "Exception 1", "condition": "Conversion to wider type of same signedness", "example": "int32_t a = int16_t_var;" },
      { "clause": "Exception 2", "condition": "Explicit cast present", "example": "static_cast<uint32_t>(signed_var)" },
      { "clause": "Exception 3", "condition": "Bitfield manipulation", "example": "reg |= (1u << 3);" }
    ],
    "references": [
      "https://www.misra.org.uk/forum/viewtopic.php?t=1234",
      "https://wiki.sei.cmu.edu/confluence/display/c/INT02-C.+Understand+integer+conversion+rules"
    ]
  }
}
```

### 4.3 진단 호버 UI (`src/views/explanationHover.ts`)

```html
<!-- Hover/사이드 패널 카드 -->
<div class="explanation-card misra-cpp-2008-10.3">
  <header>
    <span class="code">MISRA C++ 2008 Rule 10.3</span>
    <span class="risk high">HIGH</span>
  </header>
  <div class="title">Implicit conversion changes signedness</div>
  <div class="explanation">
    The expression <code>uint32_t x = -1;</code> implicitly converts signed <code>-1</code> 
    to unsigned <code>4294967295</code>. This can cause logic errors when the value is 
    later used in comparisons or arithmetic.
  </div>
  <div class="risk-detail">
    <strong>Runtime risk:</strong> Wrap-around on overflow, incorrect loop bounds, 
    security bypass in bounds checks.
  </div>
  <div class="fix">
    <strong>Suggested fix:</strong>
    <pre><code class="diff">- uint32_t x = -1;
+ uint32_t x = static_cast<uint32_t>(-1); // explicit, intent clear</code></pre>
  </div>
  <div class="exception">
    <strong>✅ Exception applicable:</strong> Exception 2 — Explicit cast present.
    <button class="apply-waiver" data-rule="misra-cpp-2008-10.3">Apply waiver comment</button>
  </div>
  <footer>
    <a href="https://misra.org.uk/rule-10-3" target="_blank">Official rationale</a>
    <a href="https://wiki.sei.cmu.edu/confluence/display/c/INT02-C" target="_blank">CERT INT02-C</a>
  </footer>
</div>
```

---

## 5. UI/UX Specification

### 5.1 호버 툴팁 (에디터 인라인)
```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 MISRA C++ 10.3  Implicit conversion changes signedness  │
│                                                              │
│ uint32_t x = -1;  // ⚠️ signed → unsigned implicit         │
│                                                              │
│ Risk: Wrap-around on overflow, comparison bugs             │
│ Fix: static_cast<uint32_t>(-1)                             │
│                                                              │
│ ✅ Exception 2 applies (explicit cast ok)                   │
│ [Apply waiver]  [Open full card]                            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 일괄 리뷰 패널 (`Agent K: Review Compliance`)
```
┌─ Compliance Review (247 violations) ────────────────────────────┐
│ Filters: [Critical 12] [High 45] [Medium 120] [Low 70]          │
│ Rules: [10.3×34] [15.5×28] [0.1×19] [Search...]                 │
├──────────────────────────────────────────────────────────────────┤
│ ☐ misra-cpp-10.3  src/util/cast.cpp:12  HIGH  Implicit sign... │
│ ☐ misra-cpp-15.5  src/net/packet.cpp:88  CRITICAL Goto stmt... │
│ ☑ misra-cpp-0.1   src/main.cpp:1      LOW     Comment style... │
│      ↳ Exception: Rule 0.1 (generated file)  [Approve]         │
├──────────────────────────────────────────────────────────────────┤
│ [Approve Selected Exceptions]  [Export Waiver Report (PDF)]     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: MISRA/Lint AI Explanation

  Scenario: Explain MISRA C++ Rule 10.3 violation
    Given a C++ file with "uint32_t x = -1;"
    And clang-tidy reports "misra-cpp-2008-10.3"
    When user hovers the diagnostic
    Then explanation card shows:
      - "Implicit conversion from signed -1 to unsigned changes value to 4294967295"
      - Risk: HIGH (wrap-around, comparison bugs)
      - Fix: "static_cast<uint32_t>(-1)"
      - Exception 2 applicable (explicit cast ok)
      - Waiver comment button inserts "// misra-exception: rule-10.3"

  Scenario: Batch review identifies waivable violations
    Given 200 MISRA violations in project
    When user opens "Review Compliance" panel
    Then panel shows 120 violations with "✅ Exception applicable" badge
    And user can multi-select → "Approve Selected" → waiver comments inserted

  Scenario: Waiver report for audit
    Given 15 approved waivers with rationale
    When user clicks "Export Waiver Report"
    Then PDF generated with:
      - Rule ID, File, Line, Exception Clause, Rationale, Approver, Date
      - Signed hash for tamper evidence

  Scenario: False positive suppression
    Given a violation is actually safe (e.g., hardware register mapping)
    When user clicks "Mark as False Positive"
    Then "// misra-false-positive: rule-10.3 rationale: hardware register" inserted
    And diagnostic severity downgraded to "hint"
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Tools-A_Search_Explore.md` | 선행 | 파일 읽기/컨텍스트 추출 |
| `PRD-Harness-10_Verification_MicroLoop.md` | 병행 | 설명 정확성 검증(자동 테스트) |
| `clang-tidy`, `cppcheck`, `pc-lint` | 런타임 | 진단 소스 |
| `compile_commands.json` | 입력 | 타입 정보 추출용 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 주요 표준(MISRA C/C++, AUTOSAR, CERT C, CWE) 규칙 DB 구축 | JSON 규칙 베이스 200+ 규칙 |
| 2 | 진단 파서(SARIF/JSON/텍스트) + 규칙 조인 | 통합 진단 모델 |
| 3 | LLM 프롬프트 엔지니어링 + 프롬프트 캐싱 | 설명 생성 품질 ≥ 90% |
| 4 | 호버 카드 + 사이드 패널 + 일괄 리뷰 UI | UX 완성 |
| 4 | 예외/거짓양성 주석 자동 삽입 + PDF 리포트 | 감사용 아티팩트 |
| 5 | CI/CD 게이트(`agentk-compliance-gate`) | 파이프라인 연동 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 규칙 DB 유지보수 부담 | 중간 | 커뮤니티 기여(PR) 유도, 자동 크롤링 스크립트 |
| LLM 환각(잘못된 예외 제안) | 높음 | Temperature 0.1, 규칙 DB 기반 검증 단계 추가, "불확실하면 제안 안 함" |
| 대량 진단 처리 지연 | 중간 | 배치 프롬프트(10개씩), 로컬 Flash 모델 우선, 비동기 스트리밍 |
| 라이선스 문제(MISRA 문서 유료) | 낮음 | 공식 문서 요약만 저장, 원문 링크만 제공 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **B급: MISRA/린트 AI 설명**
- MISRA C++ 2008/2023: https://www.misra.org.uk/
- CERT C/C++: https://wiki.sei.cmu.edu/confluence/display/c
- SARIF Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html