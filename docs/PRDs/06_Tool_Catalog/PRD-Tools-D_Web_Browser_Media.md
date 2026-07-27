# PRD-Tools-D: Web · Browser · Media (웹 · 브라우저 · 미디어)

> **Category**: Tool Catalog — D. Web · Browser · Media  
> **Phase**: `web_search`/`web_fetch`/`read_lints` → C4+ · **`browser_*` → C7** · `generate_image` → C7/나중  
> **Related PRDs**:  
> - `../02_A_Tier_Production_Grade/PRD-11_Browser_Design_Mode.md`  
> - `../04_Implementation_Phases/PRD-C4_Infrastructure.md`  
> - `../04_Implementation_Phases/PRD-C7_Production_Grade.md`  
> - `../05_Core_Infrastructure/PRD-Infra-04_Tool_Registry.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md`  
> **Out of Scope**: 로컬 파일 탐색(A), MCP 일반 브리지(F), 도메인 MISRA 전용 UI(`PRD-26`)

---

## 1. Overview

`Extension_high_impact.md` **D. 웹 · 브라우저 · 미디어**와 동일.

| 도구 | 역할 |
|------|------|
| `web_search` | 웹 검색 |
| `web_fetch` | URL 본문 가져오기 |
| `browser_*` | 네비·클릭·스크린샷 (Playwright 등) |
| `generate_image` | 이미지 생성 → assets 저장 |
| `read_lints` / diagnostics | 린트·타입 에러 |

> **Phase 정렬**: Browser는 **C7**이다. C4/C6으로 표기하지 않는다.

---

## 2. Tool Definitions

### 2.1 `web_search`

```typescript
{
  name: "web_search",
  description: "Search the public web for docs, APIs, errors.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      num_results: { type: "integer", minimum: 1, maximum: 10, default: 5 }
    },
    required: ["query"],
    additionalProperties: false
  }
}
```

---

### 2.2 `web_fetch`

```typescript
// 의도: HTML→markdown 요약. 거대 페이지는 truncate
{
  name: "web_fetch",
  description: "Fetch a URL and return readable markdown/text.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" },
      max_chars: { type: "integer", default: 50000 }
    },
    required: ["url"],
    additionalProperties: false
  }
}
```

---

### 2.3 `browser_*` (C7)

권장 세트 (Design Mode와 공유):

| 도구 | 하는 일 |
|------|---------|
| `browser_navigate` | URL 이동 |
| `browser_snapshot` / `browser_screenshot` | 접근성 스냅샷 / 이미지 |
| `browser_click` | 클릭 |
| `browser_type` | 입력 |
| `browser_wait` | 조건 대기 |
| `browser_eval` | 페이지 JS (제한) |

```typescript
{
  name: "browser_navigate",
  description: "Navigate browser to URL (Playwright). Phase C7.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string" },
      wait_until: { type: "string", enum: ["load", "domcontentloaded", "networkidle"], default: "networkidle" },
      timeout_ms: { type: "integer", default: 30000 }
    },
    required: ["url"],
    additionalProperties: false
  }
}
```

```typescript
{
  name: "browser_screenshot",
  description: "Capture viewport or selector; return path or compact image ref (not huge base64 in chat).",
  parameters: {
    type: "object",
    properties: {
      selector: { type: "string" },
      full_page: { type: "boolean", default: false },
      path: { type: "string", description: "Optional save path under workspace" }
    },
    additionalProperties: false
  }
}
```

Design Mode: 사용자 주석 좌표 + 스크린샷 → 다음 턴 컨텍스트; Agent는 `browser_*` + `edit_file`로 수정 후 재캡처. 상세: `PRD-11_Browser_Design_Mode.md`.

---

### 2.4 `generate_image`

```typescript
{
  name: "generate_image",
  description: "Generate an image asset and save under workspace (e.g. assets/).",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      path: { type: "string", description: "Target relative path" }
    },
    required: ["prompt"],
    additionalProperties: false
  }
}
```

**나중/선택** 우선순위 — MVP 불필요. Tier A LOCKED.

---

### 2.5 `read_lints` / diagnostics

```typescript
// 의도: 수정 후 검증 마이크로루프의 기본 관측. languages.getDiagnostics
{
  name: "read_lints",
  description: "Read linter/type diagnostics for paths (or whole workspace).",
  parameters: {
    type: "object",
    properties: {
      paths: { type: "array", items: { type: "string" }, description: "Empty = relevant dirty files" }
    },
    additionalProperties: false
  }
}
```

**Tier A**: ✅ (whitelist 핵심 검증 도구).

---

## 3. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| `read_lints` | ✅ | ✅ |
| `web_search` | 🔒 | ✅ (C4+) |
| `web_fetch` | 🔒 | ✅ (C4+) |
| `browser_*` | 🔒 | ✅ (**C7**) |
| `generate_image` | 🔒 | ⚪ 나중 |

**Tier A LOCKED**: Browser, image gen, bulk MCP, `delete_file`, multi-subagent, arbitrary shell.  
**NOT locked**: allowlisted `run_terminal_cmd` (C).

---

## 4. Mode Whitelist Notes

| Mode | Web · Browser · Media |
|------|----------------------|
| **Ask** | `read_lints` 허용; web/browser는 정책상 읽기 전용 허용 가능하나 기본은 최소화 |
| **Agent** | Tier·Phase 정책 전체 |
| **Plan** | `read_lints`·(옵션) `web_fetch` 문서용; browser ❌ |
| **Debug** | `read_lints` + 재현 URL은 browser(C7) 또는 사용자 |

---

## 5. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1~C3 MVP** | `read_lints` (편집 검증; C2+에서 실질 사용) |
| **C4+** | + `web_search`, `web_fetch` |
| **C5~C7** | + `browser_*` (**C7**), Design Mode, (선택) `generate_image` |

---

## 6. Acceptance Criteria

- [ ] Docs/registry mark `browser_*` as **Phase C7**, not C4/C6
- [ ] Given Tier A, When schemas built, Then no `browser_*` / `generate_image`; `read_lints` present
- [ ] Given `web_fetch` huge page, When returned, Then truncated to `max_chars`
- [ ] Given Design Mode annotation, When next Agent turn, Then screenshot+coords in context

---

## 7. Dependencies

| 관심사 | Owner |
|--------|--------|
| Browser + Design | `PRD-11_Browser_Design_Mode.md` |
| C7 GA | `PRD-C7_Production_Grade.md` |
| Registry | `PRD-Infra-04_Tool_Registry.md` |
| Tier A | `PRD-Harness-06_A_Tier_Whitelist.md` |

---

## 8. Out of Scope

- MCP 도구 표면 → F (`mcp_*`, `tool_search`)  
- 펌웨어/시리얼/레거시 스캔 UI → `PRD-24`~`PRD-27`
