# PRD-C0: 채팅 UI + 스트리밍 (Chat UI & Streaming)

> **Phase**: C0 (확장 스캐폴드 + 채팅 UI)  
> **Priority**: 최우선 (모든 후속 단계의 기반)  
> **관련 PRD**: `PRD-01_Sidebar_Chat_BYOLLM.md`, `PRD-Infra-07_Streaming_Tool_Executor.md`, `PRD-29_Settings_Hub.md`

---

## 1. Overview

### 목적
VS Code 사이드바에 **네이티브 느낌의 채팅 인터페이스**를 구축한다. 스트리밍 토큰 렌더링, 메시지 히스토리, @멘션 자동완성, 모드 드롭다운(Ask/Agent/Plan/Debug)을 포함한다.

### 범위
- Webview 기반 채팅 패널 (VS Code Chat View API 미사용 — 완전 커스텀)
- 스트리밍 델타 수신 → 마크다운 렌더링 (코드 블록 하이라이트, 머메이드 다이어그램)
- 메시지 편집/재전송, 정지/재생성, 복사/삭제
- 모드 전환 시 컨텍스트 리셋 (Cursor 방식)
- **설정 허브 C0 뼈대**: Open Settings · Models/Providers · Secrets (PRD-29 / PRD-21)

> **ID 규칙**: contributes view/command/config 접두사는 모두 **`agent-k.*`** (하이픈).  
> 디버그용 `globalThis` 객체만 camelCase `agentK` 허용 (JS 식별자).

---

## 2. Functional Requirements

| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 사이드바 패널 등록 | `vscode.window.createWebviewViewProvider('agent-k.chat')` |
| FR-02 | 메시지 버블 렌더링 | User/Assistant/Tool/System 구분, 아바타, 타임스탬프 |
| FR-03 | 스트리밍 토큰 렌더링 | `ReadableStream` → 마크다운 파싱 → 증분 DOM 업데이트 |
| FR-04 | 코드 블록 하이라이트 | Shiki/WASM 기반 실시간 하이라이트 (언어 감지) |
| FR-05 | @멘션 자동완성 | `@file:` `@folder:` `@symbol:` `@codebase:` 트리거 → 빠른 선택 |
| FR-06 | 모드 드롭다운 | Ask / Agent / Plan / Debug — 전환 시 새 컨텍스트 |
| FR-07 | 메시지 액션 | 편집(연필), 재전송(순환 화살표), 복사, 삭제, 고정 |
| FR-08 | 정지/재생성 | 스트리밍 중 Stop 버튼 → `AbortController` → 재생성 버튼 |
| FR-09 | 키보드 단축키 | Idle: `Enter`=전송, `Shift+Enter`=줄바꿈. **실행 중**: `Enter`/`Ctrl+Enter`/`Cmd+Enter`=Interrupt & Resynthesize (PRD-17), `Alt+Enter`=Queue-only |
| FR-10 | 접근성 | 스크린 리더 호환, 고대비 테마, 키보드 내비게이션 |
| FR-11 | Open Settings | 명령 `agent-k.openSettings` + 채팅 헤더 ⚙ → Settings Hub (PRD-29) |
| FR-12 | Models/Providers 뼈대 | 설정에서 Base URL·모델 선택·연결 테스트 진입 (PRD-02) |
| FR-13 | Secrets 뼈대 | API 키는 SecretStorage만 (PRD-21) · settings.json 평문 금지 |
| FR-14 | ConfigManager | `agent-k.*` 읽기/구독 (Infra-17) · Webview와 Settings UI 동일 값 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 첫 토큰 지연 (TTFT) | 로컬 모델 < 300ms, 원격 < 800ms |
| NFR-02 | 렌더링 FPS | 60fps (토큰 50개/sec 스트리밍 시) |
| NFR-03 | 메모리 | 10k 메시지 히스토리 < 100MB (가상화) |
| NFR-04 | 번들 크기 | Webview JS < 500KB gzipped (코드 분할) |

---

## 4. Technical Spec

### 4.1 Extension Entry & Webview Provider

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('agent-k.chat', provider),
    vscode.commands.registerCommand('agent-k.chat.new', () => provider.newSession()),
    vscode.commands.registerCommand('agent-k.chat.clear', () => provider.clearHistory()),
    vscode.commands.registerCommand('agent-k.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'agent-k')),
  );
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    
    // 양방향 통신
    webviewView.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'chat.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'chat.css'));
    const nonce = getNonce();
    return `<!DOCTYPE html>
      <html><head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
        <link rel="stylesheet" href="${styleUri}" nonce="${nonce}">
      </head><body>
        <div id="chat-root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body></html>`;
  }
}
```

### 4.2 Webview React App (Vite + React + TypeScript)

```tsx
// src/chat/ChatApp.tsx
export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<Mode>('agent');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController>();

  const sendMessage = async (text: string, files: Attachment[]) => {
    const userMsg = { role: 'user', content: text, attachments: files, id: uuid() };
    setMessages(m => [...m, userMsg]);
    
    const assistantMsg = { role: 'assistant', content: '', id: uuid() };
    setMessages(m => [...m, assistantMsg]);
    setStreaming(true);
    
    abortRef.current = new AbortController();
    try {
      for await (const delta of api.streamChat({
        messages: [...messages, userMsg],
        mode,
        signal: abortRef.current.signal,
      })) {
        setMessages(m => m.map(msg => msg.id === assistantMsg.id ? { ...msg, content: msg.content + delta } : msg));
      }
    } catch (e) { if (e.name !== 'AbortError') showError(e); }
    finally { setStreaming(false); }
  };

  return (
    <div className="chat-container">
      <header>
        <ModeSelector value={mode} onChange={setMode} disabled={streaming} />
        <MentionTrigger onMention={insertMention} />
      </header>
      <VirtualList
        items={messages}
        itemHeight={120}
        renderItem={({ item }) => <MessageBubble message={item} onEdit={editMessage} onRetry={retryMessage} />}
      />
      <footer>
        <Composer onSend={sendMessage} disabled={streaming} onStop={() => abortRef.current?.abort()} />
      </footer>
    </div>
  );
}
```

### 4.3 스트리밍 마크다운 렌더러 (`src/chat/StreamingMarkdown.tsx`)

```tsx
// 증분 파싱: 통합 파서 상태 머신
export function StreamingMarkdown({ content, isStreaming }) {
  const [parsed, setParsed] = useState<ParsedNode[]>([]);
  
  useEffect(() => {
    // 증분 파싱: 이전 상태에서 변경된 부분만 재파싱
    const parser = new StreamingMarkdownParser();
    const nodes = parser.feed(content);
    setParsed(nodes);
  }, [content]);

  return (
    <div className="markdown-body">
      {nodes.map(node => (
        <React.Fragment key={node.id}>
          {node.type === 'text' && <span>{node.text}</span>}
          {node.type === 'code' && <CodeBlock language={node.lang} code={node.code} streaming={isStreaming && node.isComplete === false} />}
          {node.type === 'math' && <MathJax formula={node.formula} />}
          {node.type === 'mermaid' && <MermaidDiagram definition={node.definition} />}
        </React.Fragment>
      ))}
    </div>
  );
}
```

### 4.4 메시지 타입 정의

```typescript
type Role = 'user' | 'assistant' | 'tool' | 'system';
type Mode = 'ask' | 'agent' | 'plan' | 'debug';

interface ChatMessage {
  id: string;
  role: Role;
  content: string;           // 마크다운
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  status: 'pending' | 'streaming' | 'complete' | 'error';
  timestamp: number;
  metadata?: {
    model: string;
    tokens: { input: number; output: number };
    mode: Mode;
    toolsUsed: string[];
  };
}
```

---

## 5. UI/UX Specification

### 5.1 레이아웃
```
┌─ Agent K ────────────────────────────────────────┐
│ [Ask ▼]  [🔍 @file:src/]  [⚙]  [+ New Chat]      │
├──────────────────────────────────────────────────┤
│ 👤 User (2min ago)                               │
│ ──────────────────────────────────────────────── │
│ @file:src/auth.ts explain this                   │
│ [✏️] [↻] [📋] [🗑]                               │
├──────────────────────────────────────────────────┤
│ 🤖 Assistant (streaming...)                      │
│ ──────────────────────────────────────────────── │
│ This function handles JWT validation...          │
│ ```ts                                            │
│ function validate(token: string) {  █            │
│   return jwt.verify(token, SECRET);              │
│ }                                                │
│ ```                                              │
│ [⏹ Stop]  [↻ Regenerate]                         │
├──────────────────────────────────────────────────┤
│ [Type… Enter=send / running: stop&continue · Alt+Enter=queue] [📎] [Send] │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 모드별 시스템 프롬프트 힌트 (헤더 툴팁)
- **Ask**: "Read-only exploration. No file edits."
- **Agent**: "Autonomous implementation. Tools: read, edit, terminal."
- **Plan**: "Design first. Outputs PLAN.md with Mermaid."
- **Debug**: "Hypothesis → Instrument → Reproduce → Minimal fix."

### 5.3 루프 상태 타임라인 UI (Thought / Search / Edit / Planning next moves)
> **Cursor 벤치마크**: 에이전트가 지금 무엇을 하는지 한 줄 상태로 보여주고, 끝나면 **접이식 그룹**으로 묶어 타임라인을 남긴다. (Extension_high_impact.md 줄 552-625 참조)

#### 상태 라벨 (UI Enum)
| UI 문구 | 발생 시점 | 데이터 소스 |
|---------|-----------|-------------|
| **Thinking** / **Thought** | reasoning/thinking 스트림 중·완료 | `delta.reasoning` / think 태그 / thinking part |
| **Planning next moves** | 도구 호출 직전·턴 사이 "다음 할 일" 정리 | 모델 본문 한 줄 요약 또는 하네스가 turn 시작 시 표시 |
| **Searching** / **Grepping** | `grep` / `codebase_search` / `glob` 실행 중 | tool_call name + query 요약 |
| **Reading** | `read_file` / `list_dir` | path + 줄 범위 |
| **Editing** / **Writing** | `edit_file` / `write_file` | path + +/− 요약 |
| **Running** / **Terminal** | `run_terminal_cmd` | 명령 한 줄 (민감하면 truncate) |
| **Browsing** | `browser_*` / `web_fetch` | URL |
| **Asking** | `ask_question` | 질문 제목 |
| **Done** / 최종 답 | tool_calls 없음 · 스트림 종료 | assistant content |

**표시 규칙**: 진행 중 = 스피너/펄스, 완료 = ✓ + 접힌 그룹, 실패 = ✗ + 에러 한 줄

#### 접이식 그룹화 (완료 후)
```
▾ Thought · 2.1s
    (클릭 시 reasoning 일부 — 기본 접힘, 길면 truncate)

▾ Searched codebase · 3 tools
    grep "applyEdit" · 12 hits
    glob **/*.ts · 40 files
    read src/foo.ts:80-120

▸ Edited 2 files                    ← 기본 접힘, 펼치면 path 목록
    edit_file src/foo.ts  +12 −3
    edit_file src/bar.ts   +2 −0

Planning next moves…                 ← 다음 모델 턴 직전 상태줄
```

- 같은 턴에서 **연속 동일 카테고리** 도구는 하나로 묶는다 (Search×3 → `Searched · 3 tools`)
- Edit는 Review UI 배너와 링크 (`Open Review`)
- **Planning next moves**는 (A) 모델이 짧은 status 문장 emit 또는 (B) 하네스가 tool 실행 후·재호출 전 고정 문구

#### 구현 맵
| 레이어 | 내용 |
|--------|------|
| **TurnTimeline** | `{ id, kind, title, detail?, status: running\|done\|error, startedAt, endedAt?, children[] }` |
| **이벤트 훅** | `onReasoning` · `onToolStart` · `onToolEnd` · `onAssistantText` · `onTurnBoundary` |
| **카테고리 매핑** | Tool Registry에 `uiGroup: thought\|search\|read\|edit\|terminal\|browser\|ask` |
| **Webview** | 진행 중 row는 sticky/최신만 펼침. 완료 그룹은 **기본 collapse** (Thought는 특히) |
| **본문과 분리** | 최종 사용자 답변은 타임라인 **아래**에만 두고, tool/thought는 그룹 카드로만 |

#### 코어 루프 ↔ UI 연결 플로우
```
모델 스트리밍
  → reasoning chunk    ⇒ timeline.push(Thought, running) / append detail
  → tool_call 시작     ⇒ Planning next moves 잠깐 → 해당 그룹(Search/Edit/…) running
  → 도구 결과          ⇒ 그룹 child done (요약만, 전문 금지)
  → 같은 카테고리 연속  ⇒ 기존 그룹에 child merge
  → 재호출 직전        ⇒ Planning next moves…
  → 최종 텍스트        ⇒ Answer 블록 (타임라인과 별도)
```

#### 완료 기준 (C0~C3)
- [ ] 실행 중 "Searching… / Editing… / Thinking…" 중 하나가 항상 보임
- [ ] 끝나면 카테고리별 **접이식 그룹**으로 남음
- [ ] **Planning next moves**가 턴 사이에 표시됨
- [ ] Thought/tool 본문이 채팅을 도배하지 않음 (요약 + expand)

---

## 6. Acceptance Criteria

```gherkin
Feature: Chat UI & Streaming

  Scenario: Stream tokens with code highlighting
    Given user sends "Write a quicksort in Python"
    When model streams response
    Then tokens appear character-by-character
    And code block ```python gets syntax highlighting within 50ms of ```
    And Mermaid diagram renders if present

  Scenario: Stop and regenerate
    Given model is streaming a long response
    When user clicks Stop
    Then streaming aborts immediately
    And "Regenerate" button appears
    And clicking it restarts from same prompt

  Scenario: Mode switch resets context
    Given user in Agent mode with 5-turn history
    When user switches to Plan mode
    Then new session starts (history cleared)
    And system prompt changes to Plan mode

  Scenario: @mention autocomplete
    Given user types "@file:src/"
    Then dropdown shows files under src/
    And selecting one inserts "@file:src/auth.ts"

  Scenario: Message edit and resend
    Given user message "explain this"
    When user clicks edit icon, changes to "explain this in detail", presses Enter
    Then original assistant response removed
    And new response streams for edited prompt

  Scenario: Virtualized history scroll
    Given 500 messages in history
    When user scrolls up
    Then only visible messages rendered (DOM < 50 nodes)
    And scroll position restored on session restore
```

---

## 7. Dependencies

| 의존성 | 용도 |
|--------|------|
| `@vscode/webview-ui-toolkit` | VS Code 네이티브 느낌 컴포넌트 |
| `shiki` / `shiki-es` | 코드 하이라이트 (WASM) |
| `mermaid` | 다이어그램 렌더링 |
| `katex` | 수식 렌더링 |
| `uuid` | 메시지 ID |
| `nanoid` | 논스 생성 |

---

## 8. Implementation Checklist

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | Extension 스캐폴드 + Webview Provider 등록 | `agent-k.chat` 뷰 나타남 |
| 1b | Open Settings + ConfigManager + Secrets 뼈대 | `agent-k.openSettings` · 키 평문 없음 |
| 2 | Vite + React + TS 웹뷰 셋업 + HMR | `npm run dev:webview` 작동 |
| 3 | 메시지 리스트 + VirtualList + 버블 UI | 100개 메시지 60fps 스크롤 |
| 4 | 스트리밍 파이프라인 (AbortController) | 토큰 단위 렌더링, Stop 작동 |
| 4 | 마크다운 파이프라인 (코드/수식/머메이드) | 모든 블록 렌더링 |
| 5 | @멘션 프로바이더 + 자동완성 드롭다운 | @file:, @symbol:, @codebase: 작동 |
| 6 | 모드 셀렉터 + 세션 리셋 로직 | 모드 전환 시 히스토리 클리어 |
| 7 | 메시지 액션 (편집/재전송/복사/삭제) | 모든 액션 작동 |
| 8 | 접근성/테마/키보드 단축키 마무리 | WCAG AA, 다크/라이트 완벽 |

---


## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## 9. References

- VS Code Webview Guide: https://code.visualstudio.com/api/extension-guides/webview
- Chat View API (참고): https://code.visualstudio.com/api/extension-guides/chat
- Streaming Markdown: https://github.com/vuejs/vuepress/blob/main/packages/@vuepress/plugin-markdown/lib/streaming.js