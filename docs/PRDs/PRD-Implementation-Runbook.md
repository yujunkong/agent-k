# PRD-Implementation-Runbook: Agent-K Extension 개발 가이드

> **Purpose**: PRD 문서를 실제 코드로 구현할 때 참고할 실무 가이드
> **Audience**: 구현 단계(C0~C7)의 개발자
> **Version**: 1.0 | **Date**: 2026-07-25
> **Reference**: `Extension_high_impact.md` + 90개 PRD + `PRD-Dependency-Graph.md`

---

## 📋 Quick Start: 개발 환경 셋업

### 1. 프로젝트 초기화
```bash
# VS Code Extension Generator 사용
npx --package=yo --package=generator-code yo code
# 선택: TypeScript, Webpack/ESBuild, VS Code API

# 또는 수동 구조 생성
mkdir agent-k && cd agent-k
npm init -y
npm install -D typescript @types/node @types/vscode vscode-languageclient
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom
npm install react react-dom shiki mermaid katex uuid nanoid jsonrepair zod
npm install -D @vscode/test-electron @vscode/vsce eslint prettier
```

### 2. 폴더 구조 (권장)
```
agent-k/
├── src/
│   ├── extension.ts                 # Entry point
│   ├── chat/                        # C0: 채팅 UI
│   │   ├── ChatViewProvider.ts
│   │   ├── ChatApp.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── StreamingMarkdown.tsx
│   ├── providers/                   # Provider Adapter (Spec-01)
│   │   ├── ProviderRegistry.ts
│   │   ├── BaseProviderAdapter.ts
│   │   ├── LiteLLMProvider.ts
│   │   ├── ToolCallParser.ts
│   │   └── ToolResultFormatter.ts
│   ├── tools/                       # Tool Catalog (A-G)
│   │   ├── registry.ts
│   │   ├── search/
│   │   ├── edit/
│   │   ├── terminal/
│   │   ├── web/
│   │   ├── session/
│   │   ├── orchestration/
│   │   └── debug/
│   ├── loop/                        # Agent Loop (Infra-20)
│   │   ├── AgentLoopController.ts
│   │   ├── AskModeController.ts
│   │   ├── AgentModeController.ts
│   │   ├── PlanModeController.ts
│   │   ├── DebugModeController.ts
│   │   ├── ContextAssembler.ts
│   │   ├── MaxTurnsGuard.ts
│   │   ├── DoomLoopDetector.ts
│   │   └── MessageQueue.ts
│   ├── infrastructure/              # Core Infra (Infra-01~23)
│   │   ├── instructions/
│   │   ├── context/
│   │   ├── indexing/
│   │   ├── hooks/
│   │   ├── streaming/
│   │   ├── parallel/
│   │   ├── checkpoints/
│   │   ├── compaction/
│   │   ├── permission/
│   │   ├── telemetry/
│   │   ├── lifecycle/
│   │   ├── workspace/
│   │   ├── session/
│   │   ├── cost/
│   │   └── multiworkspace/
│   ├── harness/                     # Medium Model Harness
│   │   ├── ModelTierRouter.ts
│   │   ├── VerificationMicroLoop.ts
│   │   ├── PrefetchEngine.ts
│   │   ├── PromptBuilder.ts
│   │   └── AcceptanceTests.ts
│   ├── patch/                       # Spec-02 Patch Format
│   │   ├── SearchReplaceParser.ts
│   │   ├── PatchApplier.ts
│   │   └── StalenessChecker.ts
│   ├── review/                      # Review UI
│   │   ├── ReviewUIProvider.ts
│   │   └── PendingStore.ts
│   ├── plan/                        # C5 Plan Mode
│   ├── debug/                       # C6 Debug Mode
│   ├── browser/                     # C7 Browser/Design
│   ├── worktree/                    # C7 Worktree/BoN
│   ├── mcp/                         # A-10 MCP Client
│   ├── memories/                    # A-15 Memories
│   └── skills/                      # A-28 Skills
├── webview/                         # Webview 빌드 출력
├── dist/                            # Extension 컴파일 출력
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .vscode/launch.json
└── README.md
```

### 3. 필수 설정 파일

**tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "vite.config.ts"],
  "exclude": ["node_modules", "dist", "webview"]
}
```

**vite.config.ts** (Webview용)
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/chat',
  build: {
    outDir: '../../webview',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/chat/index.html',
      output: { entryFileNames: 'chat.js', chunkFileNames: 'chat-[hash].js' }
    }
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
});
```

**package.json scripts**
```json
{
  "scripts": {
    "compile": "tsc -p ./tsconfig.json",
    "watch": "tsc -w -p ./tsconfig.json",
    "dev:webview": "vite --config vite.config.ts",
    "build:webview": "vite build --config vite.config.ts",
    "package": "vsce package",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext ts,tsx"
  }
}
```

---

## 🎯 Phase별 구현 가이드

### ═══ C0: Chat UI + Streaming ═══
**목표**: 사이드바 채팅 패널 + 스트리밍 + 모드 드롭다운 + 루프 상태 타임라인
**예상 기간**: 3-5일
**선행**: 프로젝트 셋업 완료

#### Day 1: Extension Scaffold + Webview Provider
```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/ChatViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('agentK.chat', provider),
    vscode.commands.registerCommand('agentK.chat.new', () => provider.newSession()),
    vscode.commands.registerCommand('agentK.chat.clear', () => provider.clearHistory())
  );
}

export function deactivate() {}
```

```typescript
// src/chat/ChatViewProvider.ts
export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(this.handleMessage.bind(this));
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview', 'chat.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview', 'chat.css'));
    const nonce = Buffer.from(require('crypto').randomBytes(16)).toString('base64');
    
    return `<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
      <link rel="stylesheet" href="${styleUri}" nonce="${nonce}">
    </head><body><div id="chat-root"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
  }

  private handleMessage(msg: any) { /* Webview → Extension */ }
  
  newSession() { /* Webview에 메시지 전송 */ }
  clearHistory() { /* ... */ }
}
```

#### Day 2: React Webview App + 스트리밍 파이프라인
```tsx
// src/chat/ChatApp.tsx
import { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './components/MessageBubble';
import { ModeSelector } from './components/ModeSelector';
import { Composer } from './components/Composer';
import { Timeline } from './components/Timeline';
import { VirtualList } from './components/VirtualList';

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<Mode>('agent');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController>();

  const sendMessage = async (text: string, attachments: Attachment[], mentions: Mention[]) => {
    const userMsg = { role: 'user', content: text, attachments, mentions, id: crypto.randomUUID() };
    setMessages(m => [...m, userMsg]);
    
    const assistantMsg = { role: 'assistant', content: '', id: crypto.randomUUID() };
    setMessages(m => [...m, assistantMsg]);
    setStreaming(true);
    
    abortRef.current = new AbortController();
    try {
      for await (const delta of api.streamChat({
        messages: [...messages, userMsg],
        mode,
        signal: abortRef.current.signal
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
      <VirtualList items={messages} itemHeight={120} renderItem={({ item }) => (
        <MessageBubble message={item} onEdit={editMessage} onRetry={retryMessage} />
      )} />
      <Timeline events={timelineEvents} />  {/* 루프 상태 타임라인 */}
      <footer>
        <Composer onSend={sendMessage} disabled={streaming} onStop={() => abortRef.current?.abort()} />
      </footer>
    </div>
  );
}
```

#### Day 3: 스트리밍 마크다운 렌더러 + @멘션
```typescript
// src/chat/StreamingMarkdown.tsx
export class StreamingMarkdownParser {
  private state: ParseState = { nodes: [], buffer: '', inCodeBlock: false, codeLang: '' };
  
  feed(chunk: string): ParsedNode[] {
    this.state.buffer += chunk;
    // 증분 파싱: 변경된 부분만 재파싱
    return this.incrementalParse();
  }
  
  private incrementalParse(): ParsedNode[] {
    // 1. 버퍼를 라인 단위로 분할
    // 2. 마크다운 토큰화 (코드 블록, 헤딩, 리스트, 인라인 코드 등)
    // 3. 이전 상태와 비교해 변경된 노드만 업데이트
    // 4. Shiki WASM으로 코드 블록 하이라이트 (비동기)
    return this.state.nodes;
  }
}
```

#### Day 4: Provider Registry + LiteLLM 연동
```typescript
// src/providers/ProviderRegistry.ts
export class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>();
  private currentProvider: string | null = null;
  private currentModel: string | null = null;

  register(adapter: ProviderAdapter) { this.providers.set(adapter.id, adapter); }
  
  async getCurrentProvider(): Promise<ProviderAdapter> {
    if (!this.currentProvider) throw new Error('No provider selected');
    return this.providers.get(this.currentProvider)!;
  }

  async testConnection(config: ProviderConfig): Promise<boolean> {
    const adapter = this.createAdapter(config);
    return adapter.checkHealth().then(r => r.healthy);
  }
}

// src/providers/LiteLLMProvider.ts
export class LiteLLMProvider implements ProviderAdapter {
  readonly id = 'litellm';
  readonly name = 'LiteLLM / OpenAI Compatible';
  
  constructor(private baseUrl: string, private apiKey: string) {}

  async *chatCompletionStream(req: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ ...req, stream: true }),
      signal: req.signal
    });

    for await (const chunk of this.parseSSE(response.body!)) {
      yield this.normalizeChunk(chunk);
    }
  }

  private async *parseSSE(body: ReadableStream) { /* SSE 파싱 */ }
  private normalizeChunk(chunk: any): ChatCompletionChunk { /* OpenAI 포맷 정규화 */ }
}
```

#### Day 5: 루프 상태 타임라인 UI + 모드 전환
```tsx
// src/chat/components/Timeline.tsx
interface TimelineEvent {
  id: string;
  kind: 'thought' | 'search' | 'read' | 'edit' | 'terminal' | 'browser' | 'ask' | 'planning';
  title: string;
  detail?: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  endedAt?: number;
  children: TimelineEvent[];
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="timeline">
      {events.map(event => (
        <TimelineGroup key={event.id} event={event} />
      ))}
    </div>
  );
}

function TimelineGroup({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const icon = STATUS_ICONS[event.kind];
  
  return (
    <div className="timeline-group">
      <button onClick={() => setExpanded(!expanded)} className="group-header">
        <span className="spinner" style={{ display: event.status === 'running' ? 'inline' : 'none' }} />
        {icon} {event.title} {event.endedAt && `· ${(event.endedAt - event.startedAt)/1000}s`}
        <ChevronIcon rotated={expanded} />
      </button>
      {expanded && (
        <div className="group-children">
          {event.detail && <pre>{event.detail}</pre>}
          {event.children.map(child => <TimelineGroup key={child.id} event={child} />)}
        </div>
      )}
    </div>
  );
}
```

---

### ═══ C1: Ask Mode (Read-Only) ═══
**목표**: 읽기 도구만 허용, 병렬 실행, 쓰기 도구 완전 제거, 접이식 그룹
**예상 기간**: 2-3일
**선행**: C0 완료

#### 구현 체크리스트
```bash
# 생성할 파일
src/tools/search/GrepTool.ts
src/tools/search/GlobTool.ts
src/tools/search/ListDirTool.ts
src/tools/search/ReadFileTool.ts
src/tools/search/CodebaseSearchTool.ts  # optional (C7)
src/tools/registry.ts                    # ToolRegistry 구현
src/loop/AskModeController.ts
src/loop/ParallelExecutor.ts
src/prefetch/PrefetchEngine.ts
```

#### 핵심 구현 포인트

**ToolRegistry (Infra-04)**
```typescript
// src/tools/registry.ts
export interface ToolSchema {
  name: string;
  description: string;
  parameters: z.ZodSchema;  // Zod 스키마
  category: 'readonly' | 'write' | 'exec' | 'network' | 'orchestrate';
  uiGroup: 'thought' | 'search' | 'read' | 'edit' | 'terminal' | 'browser' | 'ask';
  readonly?: boolean;
  destructive?: boolean;
  allowlist?: string[];  // 터미널 명령어 허용 리스트
}

export class ToolRegistry {
  private tools = new Map<string, ToolSchema>();
  private handlers = new Map<string, ToolHandler>();

  register(schema: ToolSchema, handler: ToolHandler) {
    this.tools.set(schema.name, schema);
    this.handlers.set(schema.name, handler);
  }

  getSchema(name: string): ToolSchema | undefined { return this.tools.get(name); }
  getHandler(name: string): ToolHandler | undefined { return this.handlers.get(name); }
  
  getSchemasForMode(mode: Mode): ToolSchema[] {
    const whitelist = MODE_WHITELIST[mode];
    return Array.from(this.tools.values()).filter(t => whitelist.includes(t.name));
  }
}

// Ask 모드 화이트리스트
const MODE_WHITELIST: Record<Mode, string[]> = {
  ask: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'web_search', 'web_fetch'],
  agent: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'web_search', 'web_fetch',
          'edit_file', 'write_file', 'run_terminal_cmd', 'ask_question', 'todo_write'],
  plan: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'web_search', 'web_fetch',
         'ask_question', 'todo_write', 'fetch_rules'],
  debug: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'web_search', 'web_fetch',
          'edit_file', 'write_file', 'run_terminal_cmd', 'ask_question', 'todo_write',
          'add_instrumentation', 'collect_runtime_logs', 'request_reproduce', 'remove_instrumentation']
};
```

**ParallelExecutor (Infra-08)**
```typescript
// src/loop/ParallelExecutor.ts
import pLimit from 'p-limit';

export class ParallelExecutor {
  private readonly limit = pLimit(16);  // 동시성 16

  async executeParallel<T>(calls: ToolCall[]): Promise<ToolResult[]> {
    const readonlyCalls = calls.filter(c => this.registry.getSchema(c.name)?.readonly);
    const writeCalls = calls.filter(c => !this.registry.getSchema(c.name)?.readonly);
    
    // 읽기 도구: 병렬 실행
    const readResults = await Promise.allSettled(
      readonlyCalls.map(call => this.limit(() => this.executeSingle(call)))
    );
    
    // 쓰기 도구: 직렬 실행 (순서 보장)
    const writeResults: ToolResult[] = [];
    for (const call of writeCalls) {
      const result = await this.executeSingle(call);
      writeResults.push(result);
      if (result.error && this.config.stopOnError) break;
    }
    
    return [...readResults.map(r => r.status === 'fulfilled' ? r.value : r.reason), ...writeResults];
  }
}
```

**PrefetchEngine (H-09)**
```typescript
// src/prefetch/PrefetchEngine.ts
export class PrefetchEngine {
  async prefetch(userMessage: string, workspace: vscode.WorkspaceFolder): Promise<PrefetchResult> {
    // 1. 경로/심볼/에러 스택 추출
    const paths = this.extractPaths(userMessage);
    const symbols = this.extractSymbols(userMessage);
    const errors = this.extractErrorStacks(userMessage);
    
    // 2. 병렬 읽기
    const [files, grepResults] = await Promise.all([
      this.readFiles(paths),
      this.grepSymbols(symbols)
    ]);
    
    // 3. 컨텍스트 블록 구성
    return {
      contextBlock: this.formatContextBlock(files, grepResults, errors),
      filesRead: files.map(f => f.path),
      symbolsFound: grepResults.flatMap(r => r.matches)
    };
  }

  private extractPaths(text: string): string[] {
    const patterns = [
      /@file:([^\s]+)/g,
      /@folder:([^\s]+)/g,
      /([a-zA-Z]:[\\/]|[\\/])[\w\\/\-. ]+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|h)/g,
      /src[\\/][\w\\/\-.]+\.(ts|tsx)/g
    ];
    return patterns.flatMap(p => [...text.matchAll(p)].map(m => m[1] || m[0]));
  }
}
```

---

### ═══ C2: Agent Single Turn (First Write) ═══
**목표**: `edit_file`/`write_file` + Diff 승인 + 터미널 1회 + 검증 마이크로루프
**예상 기간**: 3-5일
**선행**: C1 완료

#### 구현 체크리스트
```bash
src/tools/edit/EditFileTool.ts
src/tools/edit/WriteFileTool.ts
src/tools/terminal/TerminalTool.ts
src/review/ReviewUIProvider.ts
src/review/PendingStore.ts
src/patch/SearchReplaceParser.ts
src/patch/PatchApplier.ts
src/patch/StalenessChecker.ts
src/hooks/AutoVerificationHook.ts
src/verification/LintRunner.ts
src/verification/TestFinder.ts
```

#### Search-Replace 파서 (Spec-02)
```typescript
// src/patch/SearchReplaceParser.ts
export interface SearchReplacePatch {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;  // 기본 false
}

export class SearchReplaceParser {
  static parse(content: string): SearchReplacePatch[] {
    // 포맷: *** Begin Patch / *** Update File: path / oldString / newString / *** End Patch
    const patches: SearchReplacePatch[] = [];
    const regex = /\*\*\* Begin Patch\s+[\s\S]*?\*\*\* Update File: (.+?)\s+(?:oldExactLines|oldString)\s+([\s\S]*?)\s+(?:newString)\s+([\s\S]*?)\s+\*\*\* End Patch/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      patches.push({
        filePath: match[1].trim(),
        oldString: match[2],
        newString: match[3]
      });
    }
    return patches;
  }
}
```

#### PatchApplier + Staleness 검증
```typescript
// src/patch/PatchApplier.ts
export class PatchApplier {
  async apply(patch: SearchReplacePatch): Promise<ApplyResult> {
    const doc = await vscode.workspace.openTextDocument(patch.filePath);
    const fullText = doc.getText();
    
    // 1. 유일 매칭 검증
    const firstIndex = fullText.indexOf(patch.oldString);
    if (firstIndex === -1) {
      return { ok: false, error: 'SEARCH_NOT_FOUND', hint: this.getContextHint(doc, patch.oldString) };
    }
    if (fullText.indexOf(patch.oldString, firstIndex + 1) !== -1) {
      return { ok: false, error: 'SEARCH_AMBIGUOUS', hint: 'Multiple matches. Re-read file for exact context.' };
    }
    
    // 2. Staleness 체크 (마지막 read 이후 변경 여부)
    if (await this.isStale(patch.filePath, doc)) {
      return { ok: false, error: 'STALE', hint: 'File modified since last read. Re-read and retry.' };
    }
    
    // 3. 적용
    const startPos = doc.positionAt(firstIndex);
    const endPos = doc.positionAt(firstIndex + patch.oldString.length);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(startPos, endPos), patch.newString);
    
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) return { ok: false, error: 'APPLY_FAILED' };
    
    // 4. 체크포인트 기록
    await this.checkpointManager.record(patch.filePath, fullText);
    
    return { ok: true, path: patch.filePath, linesChanged: patch.newString.split('\n').length - patch.oldString.split('\n').length };
  }
}
```

#### Review UI (파일 그룹 + hunk 미리보기)
```tsx
// src/review/ReviewUIProvider.tsx
export function ReviewUIProvider() {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  
  return (
    <div className="review-banner">
      <div className="review-header">
        <span>Review · {pendingChanges.length} files</span>
        <div className="actions">
          <button onClick={keepAll}>Keep All</button>
          <button onClick={undoAll} className="danger">Undo All</button>
        </div>
      </div>
      <ul className="file-list">
        {pendingChanges.map(change => (
          <li key={change.path} className="file-row">
            <span className="path">{change.path}</span>
            <span className="diff-stats">+{change.added} −{change.removed}</span>
            <button onClick={() => keep(change.path)}>Keep</button>
            <button onClick={() => undo(change.path)}>Undo</button>
            <button onClick={() => openDiff(change.path)}>Diff</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### Verification Micro-Loop (H-10)
```typescript
// src/hooks/AutoVerificationHook.ts
export const autoVerificationHook: Hook = {
  id: 'auto-verification',
  type: 'PostToolUse',
  priority: 10,
  condition: ctx => {
    const config = getVerificationConfig(ctx.tier);
    return (ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file')
      && ctx.toolResult.success
      && (config.autoLint || config.autoTest);
  },
  
  async execute(ctx) {
    const config = getVerificationConfig(ctx.tier);
    const filePath = ctx.tool.args.path;
    const retries = ctx.toolResult.metadata?.verificationRetryCount || 0;
    
    // 1. 자동 린트
    if (config.autoLint) {
      const lintResult = await runLints(filePath);
      if (lintResult.errors.length > 0) {
        return injectVerificationError(ctx, lintResult, retries + 1, 'lint');
      }
    }
    
    // 2. 자동 테스트 (Tier B만 기본, Tier A는 옵션)
    if (config.autoTest && retries < config.maxRetries) {
      const testCmd = findRelatedTestCommand(filePath, config.allowedTestCommands);
      if (testCmd) {
        const testResult = await runTest(testCmd, config.testTimeoutMs);
        if (testResult.failed) {
          return injectVerificationError(ctx, testResult, retries + 1, 'test');
        }
      }
    }
    
    return { allow: true };
  }
};

function injectVerificationError(ctx: HookContext, result: LintResult | TestResult, retryCount: number, type: 'lint' | 'test'): HookResult {
  const errorBlock = type === 'lint'
    ? `## Lint Errors (auto-detected after edit):\n${result.errors.map(e => `${e.file}:${e.line}:${e.column} ${e.message}`).join('\n')}`
    : `## Test Failure (auto-detected after edit):\n${result.output}`;
  
  return {
    allow: true,
    modifiedResult: {
      ...ctx.toolResult,
      output: `${ctx.toolResult.output}\n\n${errorBlock}\n\n---\nThis is verification attempt ${retryCount}/${getVerificationConfig(ctx.tier).maxRetries}. Please fix and retry the edit.`,
      metadata: {
        ...ctx.toolResult.metadata,
        verificationRetryCount: retryCount,
        verificationType: type
      }
    }
  };
}
```

---

### ═══ C3: Agent Multi-Turn (Core Loop) ═══
**목표**: 코어 루프 + maxTurns + Stop + 에러→tool result + 이슈 하나를 도구로 완료
**예상 기간**: 3-4일
**선행**: C2 완료

#### AgentLoopController (Infra-20 핵심)
```typescript
// src/loop/AgentLoopController.ts
export class AgentLoopController {
  constructor(
    private provider: ProviderAdapter,
    private registry: ToolRegistry,
    private executor: ToolExecutor,
    private contextAssembler: ContextAssembler,
    private compaction: CompactionEngine,
    private checkpoint: CheckpointManager,
    private doomDetector: DoomLoopDetector,
    private maxTurnsGuard: MaxTurnsGuard,
    private messageQueue: MessageQueue,
    private telemetry: TelemetryCollector
  ) {}

  async *run(session: Session, userMessage: string, mode: Mode): AsyncIterable<LoopEvent> {
    // 1. 사용자 메시지 추가 + 프리페치
    session.messages.push({ role: 'user', content: userMessage, id: uuid() });
    const prefetch = await this.prefetchEngine.prefetch(userMessage);
    if (prefetch.contextBlock) {
      session.messages.push({ role: 'system', content: prefetch.contextBlock, id: uuid(), metadata: { prefetch: true } });
    }

    // 2. 체크포인트 (첫 쓰기 전)
    let checkpointCreated = false;

    for (let turn = 1; turn <= this.maxTurnsGuard.maxTurns; turn++) {
      this.maxTurnsGuard.checkTurn(turn);
      
      // 3. 컨텍스트 조립 (컴팩션 포함)
      const messages = await this.contextAssembler.assemble(session, mode);
      
      // 4. 모델 스트리밍
      let toolCalls: ToolCall[] = [];
      let reasoning = '';
      
      for await (const chunk of this.provider.chatCompletionStream({
        model: session.model,
        messages,
        tools: this.registry.getSchemasForMode(mode).map(toOpenAISchema),
        tool_choice: 'auto',
        stream: true
      })) {
        if (chunk.content) {
          reasoning += chunk.content;
          yield { type: 'reasoning_delta', delta: chunk.content };
        }
        if (chunk.tool_calls) {
          toolCalls = this.toolCallParser.parseAccumulated(chunk.tool_calls);
        }
        if (chunk.finish_reason) {
          yield { type: 'turn_complete', finishReason: chunk.finish_reason };
          break;
        }
      }

      // 5. 도구 호출 없음 → 종료
      if (toolCalls.length === 0) {
        yield { type: 'final_answer', content: reasoning };
        break;
      }

      // 6. 첫 쓰기 도구 전 체크포인트
      if (!checkpointCreated && toolCalls.some(c => !this.registry.getSchema(c.name)?.readonly)) {
        await this.checkpoint.create(session.id, 'pre-write');
        checkpointCreated = true;
      }

      // 7. 도구 실행 (병렬/직렬 정책)
      yield { type: 'tools_start', calls: toolCalls };
      const results = await this.executor.execute(toolCalls, session, mode);
      
      // 8. 결과 처리 + 훅 + 둠 루프 감지
      for (const result of results) {
        session.messages.push({ role: 'tool', content: result.output, tool_call_id: result.callId, id: uuid() });
        
        // PostToolUse 훅 실행
        await this.hookSystem.runPostToolUse({ tool: result.call, toolResult: result, session });
        
        // 둠 루프 감지
        if (this.doomDetector.detect(result)) {
          yield { type: 'doom_loop', tool: result.call.name };
          const userAction = await this.askUserForDoomLoop(result.call.name);
          if (userAction === 'stop') break;
        }
      }

      // 9. 컴팩션 확인
      if (this.compaction.shouldCompact(session)) {
        await this.compaction.compact(session);
      }

      // 10. 메시지 큐 처리
      const queued = this.messageQueue.shift();
      if (queued) {
        userMessage = queued;
        continue; // 다음 턴으로
      }
    }
  }
}
```

---

### ═══ C4: Infrastructure (Production Feel) ═══
**목표**: 승인·체크포인트·둠 루프·컴팩션·훅 완성 → 대량 삭제·무한루프 방지
**예상 기간**: 4-5일
**선행**: C3 완료

#### 병렬 구현 가능 항목
| 컴포넌트 | PRD | 핵심 파일 |
|----------|-----|-----------|
| Permission Gate | Spec-05 / Infra-05 | `src/permission/PermissionGate.ts` |
| Checkpoint Manager | Spec-06 / Infra-09 | `src/checkpoint/CheckpointManager.ts` |
| Doom Loop Detector | Infra-11 | `src/loop/DoomLoopDetector.ts` |
| Context Compaction | Spec-07 / Infra-10 | `src/compaction/CompactionEngine.ts` |
| Hook System | Infra-06 | `src/hooks/HookSystem.ts` |
| Memories (최소) | A-15 / H-04 | `src/memories/MemoryStore.ts` |
| Side Chat | A-12 | `src/sidechat/SideChatSession.ts` |
| Message Queue | A-17 | `src/loop/MessageQueue.ts` |

---

### ═══ C5: Plan Mode ═══
**목표**: 질문 UI · Mermaid · 계획 md · todo 분기 → 계획 승인 후 Agent 루프
**예상 기간**: 3-4일
**선행**: C4 완료

```typescript
// src/plan/PlanModeController.ts
export class PlanModeController {
  async *run(session: Session, userMessage: string): AsyncIterable<LoopEvent> {
    // 1. Clarifying Questions (객관식 UI)
    const questions = await this.generateClarifyingQuestions(userMessage);
    if (questions.length > 0) {
      yield { type: 'clarifying_questions', questions };
      const answers = await this.askUserQuestions(questions);
      userMessage = this.incorporateAnswers(userMessage, answers);
    }

    // 2. Codebase Research (Ask 모드와 유사: 읽기만)
    const research = await this.researchCodebase(userMessage);
    yield { type: 'research_complete', findings: research };

    // 3. Implementation Plan 생성 (Mermaid + Markdown)
    const plan = await this.generatePlan(userMessage, research);
    yield { type: 'plan_generated', plan };

    // 4. 사용자 리뷰/편집 (Webview에서 md 직접 편집)
    const approvedPlan = await this.waitForPlanApproval(plan);
    
    // 5. Todo 분기 (일부만 새 Agent 세션으로)
    const todos = this.parseTodos(approvedPlan);
    yield { type: 'plan_approved', todos };

    // 6. Agent 모드로 전환 실행
    const agentController = new AgentModeController(this.deps);
    yield* agentController.runWithPlan(session, approvedPlan, todos);
  }
}
```

---

### ═══ C6: Debug Mode ═══
**목표**: 가설·계측·재현·로그·최소수정·청소 (Debug 전용 도구)
**예상 기간**: 4-5일
**선행**: C4 완료

```typescript
// src/debug/DebugModeController.ts
export class DebugModeController {
  private debugServer: DebugLogServer;  // 로컬 로그 수집 엔드포인트
  
  async *run(session: Session, userMessage: string): AsyncIterable<LoopEvent> {
    // 1. Explore & Hypothesize
    const hypotheses = await this.generateHypotheses(userMessage);
    yield { type: 'hypotheses', hypotheses };
    const selected = await this.askUserToSelect(hypotheses);

    // 2. Add Instrumentation (로그 삽입)
    const instrResult = await this.addInstrumentation(selected.files, selected.hypothesis);
    yield { type: 'instrumentation_added', files: instrResult.files };

    // 3. Reproduce (사용자 in the loop)
    yield { type: 'awaiting_reproduction', steps: selected.reproSteps };
    await this.waitForUserReproduction();

    // 4. Collect & Analyze Logs
    const logs = await this.debugServer.collectLogs();
    const rootCause = await this.analyzeLogs(logs, selected.hypothesis);
    yield { type: 'root_cause', cause: rootCause };

    // 5. Targeted Fix (최소 패치)
    const fix = await this.generateMinimalFix(rootCause);
    yield { type: 'proposed_fix', fix };
    const approved = await this.askUserToApproveFix(fix);
    if (approved) await this.applyFix(fix);

    // 6. Verify & Cleanup
    await this.verifyFix(rootCause);
    await this.removeInstrumentation(instrResult.files);
    yield { type: 'debug_complete' };
  }
}
```

---

### ═══ C7: Production Grade ═══
**목표**: Browser/Design, side chat, worktree/best-of-n, `/review`, Memories, MCP, Skills, Artifacts
**예상 기간**: 2-3주
**선행**: C5, C6 완료

| 기능 | PRD | 핵심 구현 |
|------|-----|-----------|
| Browser/Design | A-11 / C7 | Playwright + Webview overlay + Design Mode annotation |
| Worktree/BoN | A-13 / C7 | `git worktree` 관리 + 병렬 Agent 실행 + 결과 비교 UI |
| Agent Review | A-14 / C7 | Diff 수집 → LM 리뷰 프롬프트 → Finding UI → Fix 마이크로 Agent |
| Memories Full | A-15 / C7 | SecretStorage 영구 저장 + UI 편집 + 자동 주입 |
| MCP Client | A-10 | MCP SDK 브리지 → Tool Registry 등록 (prefix 충돌 해결) |
| Skills | A-28 / C7 | 프롬프트 패키지 레지스트리 + 핀/언핀 UI |
| Artifacts | A-16 | 스크린샷/데모/diff 카드 저장 + Webview 갤러리 |

---

## 🧪 테스트 전략

### 단위 테스트 (각 Phase 완료 시)
```bash
# Vitest 설정
npm install -D vitest @vitest/ui happy-dom

# 실행
npm test -- --grep "C0|C1|C2"
```

| Phase | 테스트 대상 | 커버리지 목표 |
|-------|-------------|---------------|
| C0 | Webview 메시지 프로토콜, 스트리밍 파이프라인 | 80% |
| C1 | ToolRegistry, ParallelExecutor, PrefetchEngine | 85% |
| C2 | PatchParser, PatchApplier, ReviewUI, VerificationHook | 90% |
| C3 | AgentLoopController (maxTurns, doom loop, error recovery) | 85% |
| C4 | PermissionGate, Checkpoint, Compaction, Hooks | 80% |

### 수용 테스트 (Harness-15 기준)
```gherkin
# tests/acceptance/harness.feature
Feature: Medium Model Harness Acceptance

  Scenario: Single file bug fix with prefetch + edit + auto-lint
    Given autoLint = true, maxRetries = 2
    And user asks "Add null check to getUser function"
    When model edits src/auth.ts but introduces syntax error
    Then auto-lint hook runs after edit
    And lint error injected as tool_result
    And model retries edit with fix in next turn
    And lint passes on 2nd attempt

  Scenario: "Fix failing test" loop
    Given autoTest = true (Tier B), maxRetries = 1
    And user asks "Fix the login test"
    When model edits src/auth.ts
    Then related test (tests/auth.test.ts) automatically runs
    And test failure injected as tool_result
    And model retries until test passes

  Scenario: Ask mode accuracy
    Given mode = Ask
    When user asks "@file:src/auth.ts explain this"
    Then model responds with explanation referencing actual code
    And zero file modifications occur

  Scenario: Malformed tool JSON recovery
    Given 10 intentionally broken tool JSON responses
    When parser processes them
    Then >= 8 recover or produce safe error result
```

---

## 🔧 디버깅 팁

### 1. Webview 디버깅
```json
// .vscode/launch.json
{
  "configurations": [
    {
      "name": "Extension + Webview",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}", "--disable-extensions"],
      "webviewDeveloperTools": true
    }
  ]
}
```

### 2. 로컬 모델 요청/응답 로깅
```typescript
// src/providers/LoggingProvider.ts
export class LoggingProvider implements ProviderAdapter {
  constructor(private inner: ProviderAdapter) {}
  
  async *chatCompletionStream(req: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    console.log('[REQ]', JSON.stringify(req, null, 2));
    for await (const chunk of this.inner.chatCompletionStream(req)) {
      console.log('[CHUNK]', JSON.stringify(chunk, null, 2));
      yield chunk;
    }
  }
}
```

### 3. Tool Call 추적
```typescript
// src/loop/ToolCallTracer.ts
export function traceToolCalls(controller: AgentLoopController) {
  controller.on('tool_call', (call) => {
    telemetry.record('tool_call', { name: call.name, args: call.arguments });
  });
  controller.on('tool_result', (result) => {
    telemetry.record('tool_result', { callId: result.callId, success: !result.error, duration: result.duration });
  });
}
```

---

## 🚀 배포 체크리스트

### VSIX 패키징
```bash
npm install -g @vscode/vsce
vsce package  # agent-k-1.0.0.vsix 생성
vsce publish  # Marketplace 배포 (권한 필요)
```

### 설정 스키마 (package.json contributes)
```json
{
  "contributes": {
    "configuration": {
      "title": "Agent K",
      "properties": {
        "agentK.providers": { "type": "array", "default": [], "items": { "type": "object", "properties": { "id": {"type": "string"}, "name": {"type": "string"}, "baseUrl": {"type": "string"}, "apiKeyRef": {"type": "string"}, "models": {"type": "array", "items": {"type": "string"}}, "defaultParams": {"type": "object"} } } },
        "agentK.defaultProvider": { "type": "string" },
        "agentK.defaultModel": { "type": "string" },
        "agentK.verification.autoLint": { "type": "boolean", "default": true },
        "agentK.verification.autoTest": { "type": "boolean", "default": false },
        "agentK.verification.maxRetries": { "type": "integer", "default": 2, "minimum": 0, "maximum": 5 },
        "agent-k.permission.level": { "type": "string", "enum": ["ask", "accept_edits", "auto", "bypass"], "default": "accept_edits" },
        "agentK.compaction.enabled": { "type": "boolean", "default": true },
        "agentK.maxTurns": { "type": "integer", "default": 20 }
      }
    }
  }
}
```

---

## 📚 참고 자료 링크

| 문서 | 링크 |
|------|------|
| VS Code Extension API | https://code.visualstudio.com/api |
| Language Model API | https://code.visualstudio.com/api/extension-guides/language-model |
| Webview Guide | https://code.visualstudio.com/api/extension-guides/webview |
| Chat Participant | https://code.visualstudio.com/api/extension-guides/chat |
| MCP Specification | https://modelcontextprotocol.io/ |
| jsonrepair | https://github.com/josdejong/jsonrepair |
| Shiki (코드 하이라이트) | https://shiki.style/ |
| p-limit (동시성 제어) | https://github.com/sindresorhus/p-limit |

---

## 📝 변경 이력

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| 1.0 | 2026-07-25 | 초기 작성 (C0~C7 전체 가이드) |

---

*이 문서는 `PRD-Dependency-Graph.md`의 위상 정렬 순서를 따릅니다. 각 Phase 진입 전 선행 Phase의 "완료 기준"을 모두 통과했는지 확인하세요.*