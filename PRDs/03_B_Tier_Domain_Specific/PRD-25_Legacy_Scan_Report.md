# PRD-25: 레거시 스캔 → 리포트 (Legacy Scan & Report)

> **Priority**: B급 (Modernization 라이트)  
> **Phase**: C6~C7  
> **관련 PRD**: `PRD-Tools-A_Search_Explore.md`, `PRD-Tools-B_Edit_File.md`, `PRD-16_Chat_Search_Artifacts.md`

---

## 1. Overview

### 목적
기존 코드베이스(레거시)를 **언어별 파서 + LLM**으로 분석해 **마이그레이션 리포트**를 생성한다. "이 코드를 최신 스택으로 옮기려면 뭐가 필요할까?"를 자동으로 답해준다.

### 비즈니스 가치
- **수동 분석 대비 10배 빠름**: 수만 줄 레거시도 30분 내 리포트
- **객관적 지표**: 기술 부채 점수, 의존성 그래프, 위험도 히트맵
- **의사결정 지원**: "전면 재작성 vs 점진적 리팩터링" 정량 비교

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 아키텍트로서, 10년 된 Java Spring XML 프로젝트를 스캔해 "Spring Boot 3 + Gradle" 마이그레이션 난이도·공수·위험도를 알고 싶다 |
| US-02 | 팀 리더로서, 레거시 C++ 코드베이스에서 "raw pointer 사용", "전역 상태", "테스트 없음" 패턴을 자동 탐지해 우선순위 매기고 싶다 |
| US-03 | 개발자로서, 리포트를 마크다운/HTML로 내보내 이해관계자와 공유하고 싶다 |

---

## 2. Functional Requirements

### 2.1 스캔 파이프라인
| FR-ID | 단계 | 상세 |
|-------|------|------|
| FR-01 | 언어 감지 | 파일 확장자 + shebang + `package.json`/`pom.xml`/`CMakeLists.txt` 등으로 주 언어 결정 |
| FR-02 | 파서 선택 | TypeScript/Java/Python/Go/C++/C#/Rust 등 Tree-sitter 파서 동적 로드 |
| FR-03 | AST 추출 | 파일별 AST → 통합 심볼 테이블(클래스, 함수, 임포트, 전역 변수) 구성 |
| FR-04 | 패턴 매칭 | 룰 엔진(정규식 + AST 쿼리)로 안티패턴 탐지 (아래 2.2) |
| FR-05 | LLM 보강 | 애매한 영역(비즈니스 로직, 암시적 의존성)은 LLM에게 "이 코드가 뭘 하는지 요약" 요청 |
| FR-06 | 리포트 생성 | 섹션별 마크다운 + 메트릭 JSON + 대화형 HTML 생성 |

### 2.2 탐지 안티패턴 (언어 공통 + 언어별)

| 카테고리 | 패턴 (예시) | 심각도 |
|----------|-------------|--------|
| **아키텍처** | 순환 의존성, 계층 위반(Controller→Repository 직접 호출), God Class(메서드 50+) | High |
| **기술 부채** | TODO/FIXME 10개 이상 파일, deprecated API 사용, 하드코딩 설정값 | Medium |
| **안전성** | Raw pointer/수동 메모리 관리(C++), `eval`/`exec`(JS/Python), SQL 인젝션 가능성 | Critical |
| **테스트** | 테스트 파일 0개, 커버리지 0%, mock 없는 통합 테스트만 | High |
| **성능** | N+1 쿼리 패턴, 동기 I/O 루프, 큰 객체 직렬화 반복 | Medium |
| **보안** | 하드코딩 시크릿, 취약 라이브러리(CVE), 안전하지 않은 역직렬화 | Critical |
| **언어별** | Java: `raw type`, `serialVersionUID` 없음 / C++: `using namespace std` 헤더, virtual 소멸자 없음 / JS: `var`, `==`, callback hell | Medium |

### 2.3 리포트 섹션 구성
| 섹션 | 내용 | 출력 형식 |
|------|------|----------|
| **Executive Summary** | 전체 파일/라인 수, 언어 비율, 기술 부채 점수(0-100), 추천 전략(리팩터/재작성/스트랭글러) | 마크다운 + 배지 |
| **Dependency Graph** | 모듈/패키지 간 의존성 그래프 (Mermaid.js) | HTML 인터랙티브 |
| **Hotspots** | 위험도 상위 20 파일 (복잡도 × 변경 빈도 × 버그 밀도) | 표 + 히트맵 |
| **Anti-patterns** | 카테고리별 발견 건수, 샘플 코드, 수정 가이드 | 마크다운 + 코드 블록 |
| **Migration Plan** | 단계별 마이그레이션 태스크, 예상 공수(인일), 선행 조건 | 표 + 간트 차트(Mermaid) |
| **Inventory** | 전체 심볼 인벤토리(클래스/함수/전역), 미사용 코드 추정 | JSON + CSV |
| **LLM Insights** | "이 모듈은 주문 처리 핵심 로직이며, DB 스키마 강결합으로 분리 난이도 높음" | 마크다운 블록 |

### 2.4 내보내기/공유
| FR-ID | 기능 | 상세 |
|-------|------|------|
| FR-07 | 마크다운 내보내기 | `legacy-report.md` (Git 커밋 가능) |
| FR-08 | HTML 리포트 | 단일 파일(임베디드 CSS/JS), 브라우저에서 바로 열람 |
| FR-09 | JSON 메트릭 | CI/CD 파이프라인 연동용 (`legacy-metrics.json`) |
| FR-10 | 아티팩트 등록 | `PRD-16` 아티팩트 시스템에 카드로 저장 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 스캔 속도 | 10만 라인 기준 < 5분 (병렬 파싱) |
| NFR-02 | 메모리 | 피크 < 2GB (스트리밍 파싱) |
| NFR-03 | 정확도 | False Positive < 10% (룰 튜닝 후) |
| NFR-04 | 확장성 | 새 언어 파서 플러그인으로 추가 가능 |
| NFR-05 | 프라이버시 | 코드가 로컬 밖으로 나가지 않음 (로컬 LLM 사용 시) |

---

## 4. API & Technical Spec

### 4.1 스캔 오케스트레이터 (`src/legacy/scanner.ts`)

```typescript
export interface ScanConfig {
  rootPath: string;
  includeGlobs: string[];
  excludeGlobs: string[];
  languages?: string[];              // 지정 안 하면 자동 감지
  rulesets: ('arch' | 'debt' | 'security' | 'test' | 'perf' | 'lang')[];
  llmEnrichment: boolean;            // LLM 보강 사용 여부
  llmModel?: string;                 // 지정 안 하면 기본 Flash
  maxFiles?: number;                 // 제한
  outputDir: string;                 // 리포트 저장 폴더
}

export interface ScanResult {
  summary: ExecutiveSummary;
  dependencyGraph: DependencyGraph;
  hotspots: Hotspot[];
  antiPatterns: AntiPatternFinding[];
  migrationPlan: MigrationTask[];
  inventory: SymbolInventory;
  llmInsights: LLMInsight[];
  metrics: ScanMetrics;
}

export class LegacyScanner {
  constructor(
    private parserRegistry: ParserRegistry,
    private ruleEngine: RuleEngine,
    private llm: LLMProvider,
    private config: ScanConfig
  ) {}

  async scan(): Promise<ScanResult> {
    // 1. 파일 수집
    const files = await this.collectFiles();
    
    // 2. 병렬 파싱 (Worker pool)
    const parseResults = await this.parseParallel(files);
    
    // 3. 심볼 테이블 병합
    const symbolTable = this.mergeSymbolTables(parseResults);
    
    // 3. 룰 엔진 실행 (스트리밍)
    const findings = await this.ruleEngine.run(symbolTable, this.config.rulesets);
    
    // 4. 핫스팟 계산 (복잡도 × 변경 빈도 × 버그)
    const hotspots = this.computeHotspots(symbolTable, findings);
    
    // 5. 의존성 그래프
    const depGraph = this.buildDependencyGraph(symbolTable);
    
    // 6. LLM 보강 (선택적, 배치로)
    let insights: LLMInsight[] = [];
    if (this.config.llmEnrichment) {
      insights = await this.enrichWithLLM(symbolTable, findings);
    }
    
    // 7. 마이그레이션 플랜 생성
    const plan = this.generateMigrationPlan(findings, hotspots, depGraph);
    
    // 8. 리포트 아티팩트 생성
    await this.generateReports({ ... });
    
    return result;
  }
}
```

### 4.2 룰 엔진 (`src/legacy/rules.ts`)

```typescript
export interface Rule {
  id: string;
  name: string;
  category: 'arch' | 'debt' | 'security' | 'test' | 'perf' | 'lang';
  severity: 'critical' | 'high' | 'medium' | 'low';
  languages: string[];              // ['*'] 또는 ['typescript', 'java']
  // AST 쿼리 (Tree-sitter 쿼리 문법) 또는 정규식
  query?: string;                   
  regex?: string;
  // 커스텀 검증 함수 (AST 노드 받음)
  validate?: (node: ASTNode, context: RuleContext) => RuleMatch | null;
  // 수정 제안
  suggestion?: string;
  references?: string[];            // 문서/블로그 링크
}

export interface RuleMatch {
  file: string;
  range: Range;                     // 시작/끝 위치
  message: string;
  severity: Rule['severity'];
  snippet: string;                  // 매칭된 코드 조각
  suggestion?: string;
}
```

**예시 룰 (TypeScript: God Class)**

```typescript
{
  id: 'ts-god-class',
  name: 'God Class (too many methods)',
  category: 'arch',
  severity: 'high',
  languages: ['typescript'],
  query: `
    (class_declaration
      body: (class_body) @body)
  `,
  validate: (node, ctx) => {
    const body = ctx.captures.body[0];
    const methods = body.children.filter(c => c.type === 'method_definition');
    if (methods.length > 30) {
      return { 
        range: node.range, 
        message: `Class has ${methods.length} methods (threshold: 30)`,
        snippet: ctx.getText(node).slice(0, 200)
      };
    }
    return null;
  },
  suggestion: 'Extract cohesive methods into separate classes (Strategy/Repository/Service)',
}
```

---

## 5. UI/UX Specification

### 5.1 스캔 실행 UI (명령 팔레트 / 사이드바)
```
Agent K: Legacy Scan
┌─────────────────────────────────────────────────────────────┐
│  Scan Target: [workspace ▼]  [src/legacy] [Select Folder]   │
│  Languages: [Auto-detect ▼]  [TypeScript] [Java] [Python]   │
│  Rulesets:  ☑ Architecture  ☑ Security  ☑ Test  ☑ Perf      │
│             ☐ Language-specific (TS, Java, C++)             │
│  LLM Enrichment: [Flash (fast)] [Pro (deep)] [Off]          │
│  Output: [.agentk/legacy-report]                            │
│                                                               │
│  [Start Scan]  [Cancel]                                      │
└─────────────────────────────────────────────────────────────┘

Progress: ████████░░ 78%  (Parsing: 1,234/1,580 files)
          Workers: 8  |  Findings: 342  |  ETA: 45s
```

### 5.2 리포트 HTML (단일 파일, 오프라인 동작)
```
┌─ Legacy Migration Report: MyProject ────────────────────────────────┐
│  📊 Score: 42/100  |  Files: 1,247  |  Lines: 342K  |  Lang: TS 60% │
│  🏷️  Strategy: Strangler Fig (Incremental)  |  Est. Effort: 45 pd   │
├──────────────────────────────────────────────────────────────────────┤
│  Tabs: [Summary] [Dependency Graph] [Hotspots] [Anti-patterns]      │
│          [Migration Plan] [Inventory] [LLM Insights] [Export]       │
├──────────────────────────────────────────────────────────────────────┤
│ Hotspots (Top 10)                                                    │
│ ┌────┬─────────────────────┬──────┬──────┬──────┬──────┬──────────┐ │
│ │ #  │ File                │ Cycl │ Churn│ Bugs │ Debt │ Risk     │ │
│ ├────┼─────────────────────┼──────┼──────┼──────┼──────┼──────────┤ │
│ │ 1  │ src/core/OrderMgr.ts│  89  │  42  │  5   │  12  │ 🔴 94    │ │
│ │ 2  │ src/db/LegacyRepo.ts│  67  │  38  │  3   │  8   │ 🟠 78    │ │
│ │ ...                                                                    │
│ └────┴─────────────────────┴──────┴──────┴──────┴──────┴──────────┘ │
│                                                                        │
│ [Export Markdown] [Export JSON] [Save as Artifact]                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Legacy Scan & Report

  Scenario: Scan TypeScript codebase and generate report
    Given a workspace with 500 TS files (50K lines)
    When user runs "Agent K: Legacy Scan" with default settings
    Then scan completes within 3 minutes
    And report includes: summary, dependency graph, 20 hotspots, 15 anti-patterns
    And markdown report saved to .agentk/legacy-report.md
    And HTML report opens in browser with interactive graphs

  Scenario: Detect critical security anti-patterns
    Given code contains hardcoded JWT secret and SQL concatenation
    When scan runs with security ruleset
    Then findings include 2 critical issues with file/line/snippet
    And each has CVE reference and fix suggestion

  Scenario: LLM enrichment adds business context
    Given LLM enrichment enabled
    And a module "PaymentProcessor" with complex Stripe integration
    Then LLM insight says: "Core payment logic, tightly coupled to Stripe SDK v2. Migration to v3 requires signature verification rewrite. Estimated 3 days."

  Scenario: Export JSON for CI/CD gate
    When user enables JSON export
    Then .agentk/legacy-metrics.json contains: { score, findingsCount, hotspotCount, byCategory }
    And CI can fail if score < 60 or critical > 0

  Scenario: Incremental re-scan
    Given previous scan exists
    And user modifies 5 files
    When re-scan triggered
    Then only changed files re-parsed
    And report updated in < 30 seconds
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `tree-sitter` + 언어별 그래머 | npm | 파서 엔진 (MIT) |
| `PRD-Tools-A_Search_Explore.md` | 선행 | grep/glob/파일 읽기 도구 재사용 |
| `PRD-16_Chat_Search_Artifacts.md` | 병행 | 리포트 아티팩트 저장 |
| `PRD-Harness-10_Verification_MicroLoop.md` | 병행 | LLM 보강 시 검증 루프 적용 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | Tree-sitter 레지스트리 + 기본 파서(TS, Java, Python, Go, C++) | 파서 레지스트리 |
| 2 | 룰 엔진 + 핵심 룰셋(arch, security, test, lang) | 50+ 기본 룰 |
| 3 | 스캔 오케스트레이터 + 워커 풀 병렬화 | 100K lines < 3분 |
| 4 | 리포트 생성기 (MD/HTML/JSON) + Mermaid 그래프 | 3포맷 출력 |
| 5 | LLM 보강 파이프라인 (배치 프롬프트 + 캐싱) | Insights 섹션 |
| 6 | HTML 리포트 Webview + 인터랙티브 그래프 | 브라우저 리포트 |
| 7 | CI/CD 게이트 액션 (`agentk-legacy-gate`) | 파이프라인 연동 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| Tree-sitter 그래머 버전 불일치 | 중간 | 그래머 버전 고정(package.json), CI에서 호환성 테스트 |
| 대용량 파일(생성된 코드) 파싱 OOM | 중간 | 파일 크기 임계값(1MB) 초과 시 청크 파싱 또는 스킵 |
| LLM 보강 비용/지연 | 낮음 | 배치 프롬프트(한 번에 10개 파일), 로컬 Flash 모델 우선 |
| False Positive 과다 | 높음 | 룰별 confidence 임계값, 사용자 피드백으로 튜닝, "무시" 태그 지원 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **B급: 레거시 스캔 → 리포트**
- Tree-sitter: https://tree-sitter.github.io/tree-sitter/
- Mermaid.js: https://mermaid.js.org/
- Software Architecture Metrics: https://www.sonarsource.com/products/sonarqube/