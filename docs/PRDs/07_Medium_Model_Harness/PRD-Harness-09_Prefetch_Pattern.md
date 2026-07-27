# PRD-Harness-09: Prefetch Pattern (프리페치 패턴)

> **Category**: Medium Model Harness  
> **Phase**: C1 (Ask 모드부터) ~ C3 (스트리밍 선실행)  
> **관련 PRD**: `PRD-Infra-07_Streaming_Tool_Executor.md`, `PRD-07_Parallel_File_Search.md`, `PRD-Harness-08_Harness_Duties.md`

---

## 1. Overview

### 목적
사용자 메시지에서 **경로·심볼·에러 스택**을 추출해 **모델 호출 전에** 관련 파일을 **선조사(Pre-fetch)**하고, 결과를 **"이미 조사된 컨텍스트"** 블록으로 시스템 메시지에 주입한다. "모델이 '어디를 볼지' 헤매는 턴을 줄인다."

### 비즈니스 가치
- **체감 속도 3~5배 향상**: 모델이 도구 호출→응답→다음 도구 루프 돌 필요 없음
- **중급 모델 보완**: 도구 호출 능력이 약한 모델도 "이미 조사된 컨텍스트"만으로 판단 가능
- **토큰 절약**: 도구 호출/결과 왕복 토큰 제거

---

## 2. Functional Requirements

### 2.1 추출 휴리스틱 (`src/prefetch/extractors.ts`)

| 추출 대상 | 정규식/방법 | 우선순위 |
|-----------|-------------|----------|
| **@멘션** | `@(file|folder|symbol|codebase):([^\s]+)` | 1순위 (즉시 읽기) |
| **에러 스택 트레이스** | `at\s+(\S+)\s+\(?([\w\/\.-]+):(\d+):(\d+)\)?` | 1순위 (라인 ±10 읽기) |
| **Import 경로** | `(?:from|import)\s+['"](\.[^'"]+)['"]` | 2순위 (glob → read) |
| **카멜/파스칼 심볼** | `\b([A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-z]+(?:[A-Z][a-z]+)+)\b` (5자 이상, 2단어+) | 3순위 (LSP + grep) |
| **파일 경로 패턴** | `[\w/.-]+\.(ts|js|py|go|rs|java|cpp|h)` | 3순위 (glob) |

### 2.2 조사 플랜 수립 (`src/prefetch/planner.ts`)

```typescript
interface PrefetchPlan {
  explicitMentions: { type: 'file'|'folder'|'symbol'|'codebase', path: string }[];
  stackTraces: { func: string, file: string, line: number }[];
  importPaths: string[];
  camelCaseSymbols: string[];
  keywords: string[];
}

export function buildPrefetchPlan(text: string): PrefetchPlan {
  const plan: PrefetchPlan = { explicitMentions: [], stackTraces: [], importPaths: [], camelCaseSymbols: [], keywords: [] };
  
  // 1. @멘션
  const mentionRegex = /@(file|folder|symbol|codebase):([^\s]+)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    plan.explicitMentions.push({ type: match[1] as any, path: match[2] });
  }
  
  // 2. 스택 트레이스 (Node/Python/Go/Rust 공통)
  const stackRegex = /at\s+(\S+)\s+\(?([\w\/\.-]+):(\d+):(\d+)\)?/g;
  while ((match = stackRegex.exec(text)) !== null) {
    plan.stackTraces.push({ func: match[1], file: match[2], line: parseInt(match[3]) });
  }
  
  // 3. Import 경로
  const importRegex = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  while ((match = importRegex.exec(text)) !== null) {
    plan.importPaths.push(match[1]);
  }
  
  // 4. 카멜/파스칼 심볼 (최소 5자, 2단어+)
  const symbolRegex = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-z]+(?:[A-Z][a-z]+)+)\b/g;
  const symbols = new Set<string>();
  while ((match = symbolRegex.exec(text)) !== null) {
    if (match[1].length >= 5) symbols.add(match[1]);
  }
  plan.camelCaseSymbols = Array.from(symbols).slice(0, 20);
  
  return plan;
}
```

### 2.3 병렬 실행기 (`src/prefetch/executor.ts`)

```typescript
import pLimit from 'p-limit';
const limit = pLimit(16);

export async function executePrefetchPlan(
  plan: PrefetchPlan,
  workspaceRoot: string
): Promise<PrefetchResult[]> {
  const tasks: Promise<PrefetchResult>[] = [];

  // 1. 명시적 멘션 → 최우선 읽기
  for (const m of plan.explicitMentions) {
    tasks.push(limit(() => readFileWithContext(m.path, workspaceRoot)));
  }

  // 2. 스택 트레이스 → 해당 라인 ±10 읽기
  for (const s of plan.stackTraces) {
    tasks.push(limit(() => readFileRange(s.file, s.line - 10, s.line + 10, workspaceRoot)));
  }

  // 3. 심볼 → LSP 정의 + grep 병렬
  for (const sym of plan.camelCaseSymbols.slice(0, 10)) {
    tasks.push(limit(() => lspDefinition(sym, workspaceRoot)));
    tasks.push(limit(() => grepSymbol(sym, workspaceRoot)));
  }

  // 4. Import 경로 → glob → 읽기
  for (const imp of plan.importPaths.slice(0, 10)) {
    tasks.push(limit(() => globAndRead(imp, workspaceRoot)));
  }

  // 5. 키워드 grep (상위 3개만)
  for (const kw of plan.keywords.slice(0, 3)) {
    tasks.push(limit(() => grepAndReadTop(kw, 5, workspaceRoot)));
  }

  const results = await Promise.allSettled(tasks);
  return results
    .filter(r => r.status === 'fulfilled' && r.value.content.length > 0)
    .map(r => (r as PromiseFulfilledResult<PrefetchResult>).value);
}
```

---

## 3. 컨텍스트 주입 포맷

```markdown
<!-- PREFETCH CONTEXT (auto-injected, read-only) -->
<investigated_context>
<file path="src/auth/login.ts" lines="1-80">
```ts
// src/auth/login.ts
export async function login(creds: Credentials) {
  const user = await findUser(creds.email);
  if (!user) throw new AuthError('User not found');
  // ...
}
```
</file>

<file path="src/auth/token.ts" lines="45-65">
```ts
// src/auth/token.ts (grep: "refreshToken")
export function refreshToken(rt: string) { ... }
```
</file>

<grep pattern="refreshToken" matches="3" files="2">
src/auth/token.ts:45
src/auth/session.ts:12
</grep>
</investigated_context>
```

---

## 4. 통합 포인트

### 4.1 채팅 핸들러 진입점 (`src/chat/handler.ts`)

```typescript
async function handleUserMessage(message: ChatMessage) {
  // 1. 프리페치 시작 (논블로킹, 모델 호출과 병렬로 시작해도 됨)
  const prefetchPromise = prefetchEngine.run(message.text, workspaceRoot);

  // 2. 시스템 프롬프트 + 규칙 조립
  const systemPrompt = buildSystemPrompt(mode, rules);

  // 3. 프리페치 완료 대기 (타임아웃 2s)
  let prefetchContext = '';
  try {
    const results = await Promise.race([
      prefetchPromise,
      timeout(2000, 'Prefetch timeout')
    ]);
    prefetchContext = formatPrefetchContext(results);
  } catch {
    // 타임아웃/에러 시 빈 컨텍스트로 진행
  }

  // 4. 모델 호출 (프리페치 컨텍스트 포함)
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: prefetchContext },  // 별도 블록
    ...conversationHistory,
    { role: 'user', content: message.text },
  ];

  return provider.chatCompletionStream({ messages, tools: toolSchemas });
}
```

### 4.2 설정 (`package.json` configuration)

```json
{
  "agentK.prefetch.enabled": { "type": "boolean", "default": true },
  "agentK.prefetch.timeoutMs": { "type": "number", "default": 2000 },
  "agentK.prefetch.concurrency": { "type": "number", "default": 16, "minimum": 4, "maximum": 64 },
  "agentK.prefetch.maxFiles": { "type": "number", "default": 20 },
  "agentK.prefetch.maxGrepResults": { "type": "number", "default": 50 },
  "agentK.prefetch.extractStackTraces": { "type": "boolean", "default": true },
  "agentK.prefetch.extractSymbols": { "type": "boolean", "default": true }
}
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Prefetch Pattern

  Scenario: Explicit @file mention prefetched before model
    Given user sends "@file:src/auth.ts explain this"
    When message is sent
    Then prefetch reads src/auth.ts (full or 250 lines)
    And model receives file content in investigated_context block
    And model answers without calling read_file tool

  Scenario: Error stack trace triggers file reads
    Given user pastes error stack containing "at login (src/auth.ts:42)"
    When message is sent
    Then prefetch reads src/auth.ts lines 32-52
    And model sees the exact error location context

  Scenario: Symbol detection triggers LSP + grep
    Given user asks "Where is UserService defined?"
    When message is sent
    Then prefetch runs lsp_definition("UserService") and grep("UserService")
    And results include definition location and usages

  Scenario: Large repo completes within timeout
    Given workspace has 50,000 files
    When user asks a question
    Then prefetch completes within 2 seconds
    And at most 20 files are read
    And model receives truncated but useful context

  Scenario: Ripgrep fallback
    Given ripgrep is not installed
    When prefetch runs grep
    Then vscode findTextInFiles is used as fallback
    And results are returned (slower but functional)
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 6. References

- `PRD-Infra-07_Streaming_Tool_Executor.md` — 스트리밍 중 도구 선실행과 유사 패턴
- `PRD-07_Parallel_File_Search.md` — 병렬 읽기/그렙 인프라 재사용
- `PRD-Harness-08_Harness_Duties.md` — Duty #6 "프리페치/프리실행"
- `p-limit`: https://github.com/sindresorhus/p-limit