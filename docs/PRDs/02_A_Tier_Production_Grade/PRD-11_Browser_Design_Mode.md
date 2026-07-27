# PRD-11: Browser + Design Mode (Browser & Design Mode)

> **Priority**: A급 (UI 검증·클릭·스크린샷·요소 지정)  
> **Phase**: C7 (풀 제품급)  
> **관련 PRD**: `PRD-Tools-D_Web_Browser_Media.md`, `PRD-Harness-08_Harness_Duties.md`, `PRD-C7_Production_Grade.md`

---

## 1. Overview

### 목적
**Playwright/Puppeteer**를 확장에 내장해 **헤드리스 브라우저**를 제어한다. 네비게이션, 클릭, 입력, 스크린샷, 요소 선택(Design Mode) → 결과를 다음 턴 컨텍스트에 주입하여 프론트엔드 버그 재현·수정·검증 루프를 자동화한다.

### 비즈니스 가치
- **프론트엔드 개발자 킬러 피처**: "이 버튼 클릭하면 500 에러 나" → 자동 재현 → 수정 → 재검증
- **Design Mode**: 스크린샷 위 박스/화살표 주석 → 좌표+이미지 컨텍스트 주입 → Agent가 CSS/셀렉터 수정
- **로컬 완결**: 클라우드 브라우저 불필요, Playwright 로컬 바이너리 사용

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "로그인 폼 제출 시 500 에러"라 하면 브라우저가 자동 재현하고 콘솔/네트워크 로그를 줘서 원인 찾고 싶다 |
| US-02 | 개발자로서, 스크린샷에 빨간 박스로 "여기 버튼 색 바꿔줘"라 표시하면 Agent가 해당 CSS 셀렉터를 찾아 수정하고 싶다 |
| US-03 | QA로서, "체크아웃 플로우 전체 스크린샷 찍어줘" 하면 헤드리스로 순회 캡처해 리포트 받고 싶다 |

---

## 2. Functional Requirements

### 2.1 브라우저 도구 세트 (`browser_*`)
| 도구 | 기능 | 파라미터 |
|------|------|----------|
| `browser_navigate` | URL 이동, 대기 | `{ url, waitUntil: 'load'|'networkidle'|'domcontentloaded', timeoutMs }` |
| `browser_click` | 클릭 (셀렉터/좌표) | `{ selector?, x?, y?, button: 'left'|'right'|'middle', count }` |
| `browser_type` | 텍스트 입력 | `{ selector, text, delayMs }` |
| `browser_hover` | 호버 | `{ selector }` |
| `browser_select_option` | 드롭다운 선택 | `{ selector, value|label|index }` |
| `browser_screenshot` | 스크린샷 캡처 | `{ fullPage?, selector?, clip?, format: 'png'|'jpeg', quality?, path? }` |
| `browser_pdf` | PDF 저장 | `{ path, format, margin, printBackground }` |
| `browser_evaluate` | 페이지 컨텍스트 JS 실행 | `{ script, args[] }` |
| `browser_console_logs` | 콘솔 로그 수집 | `{ since?: timestamp, level?: 'log'|'warn'|'error' }` |
| `browser_network_logs` | 네트워크 요청/응답 | `{ filterUrl?, filterStatus?, since? }` |
| `browser_get_dom` | DOM 스냅샷 (outerHTML) | `{ selector? }` |
| `browser_get_accessibility_tree` | 접근성 트리 (요소 선택용) | `{ interestingOnly?: true }` |

### 2.2 Design Mode (주석 기반 UI 수정 루프)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 스크린샷 오버레이 Webview | 캡처 이미지 위에 Canvas 오버레이로 박스/화살표/텍스트 그리기 |
| FR-02 | 주석 메타데이터 | `{ type: 'rect'|'arrow'|'text', x, y, width, height, color, label, selector? }` |
| FR-03 | 셀렉터 자동 추출 | 박스 영역 → `page.locator(...).first()` → 고유 셀렉터 생성 (CSS/XPath) |
| FR-04 | 컨텍스트 주입 | 다음 턴 시스템 메시지에 `<design_annotation>` 블록으로 이미지(base64) + 주석 배열 포함 |
| FR-05 | 수정 후 재캡처 | Agent가 `edit_file`로 CSS/HTML 수정 → `browser_navigate` + `browser_screenshot`로 검증 |

### 2.3 브라우저 세션 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-06 | 세션 풀 | 동시 3개 세션까지 (메모리 보호), LRU 제거 |
| FR-07 | 영구 프로필 | `userDataDir`으로 쿠키/스토리지 유지 (옵션) |
| FR-08 | 뷰포트/디바이스 에뮬 | 프리셋: Desktop(1280x720), Mobile(375x667), Tablet(768x1024) |
| FR-09 | 인증 쿠키 주입 | `browser_set_cookie` 도구로 세션 하이재킹 방지 로그인 |
| FR-10 | 다운로드 처리 | 다운로드 이벤트 → 워크스페이스 `downloads/` 폴더 저장 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 브라우저 기동 시간 | Cold start < 3s (Playwright pre-launch pool로 500ms) |
| NFR-02 | 메모리 사용량 | 세션당 < 200MB, 총 < 800MB |
| NFR-03 | 스크린샷 지연 | 캡처→base64 인코딩 < 200ms |
| NFR-04 | 병렬 탭 | 세션당 5개 탭, 동시 2세션 실행 |
| NFR-05 | 보안 | `file://` 프로토콜 차단, 로컬호스트만 허용 (설정으로 완화 가능) |

---

## 4. API & Technical Spec

### 4.1 Playwright 래퍼 (`src/browser/playwright.ts`)

```typescript
import { chromium, Browser, BrowserContext, Page, devices } from 'playwright';

export class BrowserManager {
  private pool: BrowserPool;
  private defaultViewport = { width: 1280, height: 720 };

  constructor() {
    this.pool = new BrowserPool({
      maxBrowsers: 2,
      maxContextsPerBrowser: 3,
      launchOptions: {
        headless: true,
        args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
      },
    });
  }

  async navigate(sessionId: string, url: string, options: NavigateOptions = {}): Promise<NavigateResult> {
    const page = await this.pool.acquirePage(sessionId);
    const start = Date.now();
    
    try {
      const response = await page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle',
        timeout: options.timeoutMs || 30000,
      });
      
      return {
        url: page.url(),
        status: response?.status(),
        title: await page.title(),
        loadTimeMs: Date.now() - start,
        consoleErrors: await this.getConsoleErrors(page),
      };
    } catch (err) {
      await this.captureErrorSnapshot(page, err);
      throw err;
    }
  }

  async click(sessionId: string, params: ClickParams): Promise<void> {
    const page = await this.pool.getPage(sessionId);
    const locator = params.selector 
      ? page.locator(params.selector).first()
      : page.mouse; // 좌표 클릭
    
    if (params.selector) {
      await locator.click({ button: params.button, clickCount: params.count, timeout: 5000 });
    } else {
      await page.mouse.click(params.x!, params.y!, { button: params.button, clickCount: params.count });
    }
  }

  async screenshot(sessionId: string, params: ScreenshotParams): Promise<ScreenshotResult> {
    const page = await this.pool.getPage(sessionId);
    const buffer = await page.screenshot({
      fullPage: params.fullPage,
      type: params.format || 'png',
      quality: params.quality,
      clip: params.clip,
      path: params.path, // 디스크 저장 옵션
    });
    
    return {
      base64: buffer.toString('base64'),
      mimeType: `image/${params.format || 'png'}`,
      width: page.viewportSize()?.width,
      height: page.viewportSize()?.height,
    };
  }

  async evaluate(sessionId: string, script: string, args: unknown[] = []): Promise<EvaluateResult> {
    const page = await this.pool.getPage(sessionId);
    const result = await page.evaluate(script, ...args);
    return { result: this.serializeResult(result) };
  }

  async getConsoleLogs(sessionId: string, since?: number): Promise<ConsoleLog[]> {
    const page = await this.pool.getPage(sessionId);
    return page.context().pages()
      .flatMap(p => p.context().consoleMessages())
      .filter(m => !since || m.timestamp() > since)
      .map(m => ({ type: m.type(), text: m.text(), timestamp: m.timestamp() }));
  }

  async getNetworkLogs(sessionId: string, filter?: NetworkFilter): Promise<NetworkLog[]> {
    const page = await this.pool.getPage(sessionId);
    // Playwright는 네트워크 로그 네이티브 지원 안 함 → CDP 세션 사용
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    // ... CDP Network.requestWillBeSent / responseReceived 수신
  }

  private serializeResult(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Error) return { error: value.message, stack: value.stack };
    if (Array.isArray(value)) return value.map(v => this.serializeResult(v));
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Element) return { tagName: value.tagName, outerHTML: value.outerHTML };
    // 순환 참조 방지
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(value, (_, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }));
  }
}
```

### 4.2 브라우저 풀 (`src/browser/pool.ts`)

```typescript
class BrowserPool {
  private browsers: Browser[] = [];
  private contexts: Map<string, BrowserContext> = new Map(); // sessionId -> context
  private pageCache: Map<string, Page> = new Map(); // sessionId -> page
  private readonly maxBrowsers: number;
  private readonly maxContextsPerBrowser: number;

  async acquirePage(sessionId: string): Promise<Page> {
    if (this.pageCache.has(sessionId)) return this.pageCache.get(sessionId)!;

    const browser = await this.getOrCreateBrowser();
    const context = await browser.newContext({
      viewport: this.defaultViewport,
      recordVideo: { dir: '.agent-k/videos', size: this.defaultViewport },
    });
    this.contexts.set(sessionId, context);

    const page = await context.newPage();
    this.pageCache.set(sessionId, page);
    
    // 콘솔/에러 자동 수집
    page.on('console', msg => this.logConsole(sessionId, msg));
    page.on('pageerror', err => this.logError(sessionId, err));
    
    return page;
  }

  async releaseSession(sessionId: string): Promise<void> {
    const page = this.pageCache.get(sessionId);
    if (page) {
      await page.close();
      this.pageCache.delete(sessionId);
    }
    const context = this.contexts.get(sessionId);
    if (context) {
      await context.close();
      this.contexts.delete(sessionId);
    }
  }

  private async getOrCreateBrowser(): Promise<Browser> {
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await chromium.launch(this.launchOptions);
      this.browsers.push(browser);
      return browser;
    }
    // LRU: 가장 적게 사용된 브라우저 반환 (간단히 첫 번째)
    return this.browsers[0];
  }
}
```

### 4.3 Design Mode Webview (`src/views/designMode.ts`)

```html
<!-- Webview HTML -->
<canvas id="overlay" style="position:absolute;top:0;left:0;"></canvas>
<img id="screenshot" src="data:image/png;base64,..." style="max-width:100%;">

<script>
const vscode = acquireVsCodeApi();
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
let annotations = [];
let currentTool = 'rect'; // rect, arrow, text
let isDrawing = false;

// 이미지 로드 시 캔버스 크기 맞춤
document.getElementById('screenshot').onload = () => {
  canvas.width = screenshot.naturalWidth;
  canvas.height = screenshot.naturalHeight;
  redraw();
};

// 마우스 이벤트
canvas.onmousedown = (e) => { isDrawing = true; start = getCanvasPos(e); };
canvas.onmousemove = (e) => { if (isDrawing) { preview = getCanvasPos(e); redraw(); } };
canvas.onmouseup = (e) => { 
  isDrawing = false; 
  annotations.push({ tool: currentTool, start, end: getCanvasPos(e), color: '#ff0000' });
  vscode.postMessage({ type: 'annotations_update', annotations });
  redraw();
};

// 셀렉터 추출 버튼
document.getElementById('extract_selector').onclick = async () => {
  // 마지막 박스 영역으로 page.locator 호출
  const last = annotations[annotations.length - 1];
  if (last.tool === 'rect') {
    vscode.postMessage({ type: 'extract_selector', rect: last });
  }
};

function redraw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(screenshot, 0, 0);
  for (const a of annotations) { drawAnnotation(ctx, a); }
  if (isDrawing && preview) { drawAnnotation(ctx, { ...annotations[0], end: preview }); }
}
</script>
```

### 4.4 도구 정의 (JSON Schema)

```json
{
  "name": "browser_screenshot",
  "description": "Capture a screenshot of the current page or element",
  "parameters": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Browser session ID" },
      "fullPage": { "type": "boolean", "default": false },
      "selector": { "type": "string", "description": "CSS selector to capture specific element" },
      "format": { "type": "string", "enum": ["png", "jpeg"], "default": "png" },
      "quality": { "type": "integer", "minimum": 1, "maximum": 100, "default": 90 }
    },
    "required": ["sessionId"]
  }
}
```

---

## 5. UI/UX Specification

### 5.1 브라우저 세션 사이드바 뷰
```
┌─ Browser Sessions ──────────────────────────────┐
│  [+ New Session]  (Desktop ▼)  [📷] [📄] [🗑]    │
├──────────────────────────────────────────────────┤
│ 🟢 session-abc123  https://app.example.com       │
│    └─ Tab 1: Dashboard (active)                  │
│    └─ Tab 2: Settings                            │
│    [Console] [Network] [Screenshot] [Design]     │
├──────────────────────────────────────────────────┤
│ 🟡 session-def456  http://localhost:3000         │
│    └─ Tab 1: Login Page                          │
└──────────────────────────────────────────────────┘
```

### 5.2 Design Mode 오버레이
```
┌─ Design Mode: https://app.example.com/dashboard ────────────────┐
│  [Rect] [Arrow] [Text] [Color: 🔴] [Extract Selector] [Done]   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ████████████████████████████████████████████████████████  │  │
│  │  █  [Header]                                    [User] █  │  │
│  │  █  ┌────────────────────────────────────────────────┐   █  │
│  │  █  │  🔴 ┌─────────────────────┐   This button     │   █  │
│  │  █  │     │  Submit Order       │   should be green  ▼  █  │
│  │  █  │     └─────────────────────┘                     █  │
│  │  █  └────────────────────────────────────────────────┘   █  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Annotations: 3  |  Next: Agent will fix CSS                   │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Browser Automation

  Scenario: Navigate and capture console errors
    Given a browser session is started
    When agent calls browser_navigate("https://example.com/login")
    And agent calls browser_type({selector: '#email', text: 'test@test.com'})
    And agent calls browser_click({selector: 'button[type=submit]'})
    Then browser_console_logs returns the JS error from failed submit
    And browser_network_logs shows the failed POST /api/login (500)

  Scenario: Design Mode annotation flow
    Given agent captures screenshot of checkout page
    When user opens Design Mode Webview
    And user draws red rectangle around "Place Order" button
    And user adds text "Change to green"
    And user clicks "Extract Selector"
    Then agent receives annotation with selector "button[data-testid=place-order]"
    And agent calls edit_file to change CSS
    And agent re-navigates and screenshots to verify

  Scenario: Session isolation and cleanup
    Given 3 browser sessions created
    When 4th session requested
    Then LRU session is closed and new one created
    And memory stays under 800MB

  Scenario: Authentication cookie injection
    Given user has valid session cookie for app.example.com
    When agent calls browser_set_cookie({domain: 'app.example.com', name: 'session', value: '...'})
    And agent navigates to protected page
    Then page loads without login redirect

  Scenario: Download handling
    When agent triggers download via browser_click
    Then file saved to workspace/downloads/ with original name
    And agent can read_file the downloaded content
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `playwright` (npm) | 런타임 | Chromium/Firefox/WebKit 번들 (~150MB) |
| `PRD-Tools-D_Web_Browser_Media.md` | 상위 | 도구 정의 |
| `PRD-C7_Production_Grade.md` | 상위 | Browser/Design Mode 제품 단계 (C7) |
| `PRD-C6_Debug_Mode.md` | 참고 | Debug 계측·런타임 로그만 필요 시 |
| `PRD-Harness-08_Harness_Duties.md` | 병행 | 중급 모델용 브라우저 도구 제한 (A티어 제외) |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | Playwright 번들링 + BrowserPool + 기본 도구 (navigate/click/screenshot) | E2E 네비게이션 테스트 |
| 2 | 콘솔/네트워크 로그 수집 (CDP) + evaluate | 디버그 정보 완비 |
| 3 | Design Mode Webview (Canvas 오버레이 + 셀렉터 추출) | 주석→셀렉터 플로우 |
| 4 | 세션 풀링 + 뷰포트/디바이스 프리셋 + 쿠키/다운로드 | 프로덕션 안정성 |
| 5 | 보안 강화 (URL 허용리스트, file:// 차단) | 엔터프라이즈 대응 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| Playwright 바이너리 크기 (확장 팩 150MB+) | 중간 | `playwright-core`만 번들, 브라우저는 사용자 별도 설치 옵션 제공 |
| 헤드리스 감지 (봇 차단) | 낮음 | `stealth` 플러그인 옵션, User-Agent 커스터마이징 |
| 메모리 누수 (페이지/컨텍스트 미해제) | 높음 | Pool에서 강제 TTL(30분), 세션 해제 시 `page.close()` 보장 |
| 동시 세션 충돌 (동일 origin 쿠키) | 중간 | 세션별 독립 `userDataDir`, 쿠키 격리 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: Browser + Design Mode**, **최근 Cursor 기능: Browser GA + Design Mode**
- Playwright: https://playwright.dev/docs/api/class-playwright
- CDP Protocol: https://chromedevtools.github.io/devtools-protocol/
- Cursor Design Mode: https://cursor.sh/blog/design-mode