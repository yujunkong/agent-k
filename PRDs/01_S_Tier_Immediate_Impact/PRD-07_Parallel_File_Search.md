# PRD-07: 병렬 파일 탐색·읽기 (Parallel File Search & Read)

> **Priority**: S급 (확장이 직접 하면 에이전트보다 빠름)  
> **Phase**: C1 (Ask 모드)부터 즉시 적용  
> **관련 PRD**: `PRD-C1_Ask_Mode.md`, `PRD-Infra-07_Streaming_Tool_Executor.md`, `PRD-Infra-08_Parallel_Serial_Policy.md`, `PRD-Harness-09_Prefetch_Pattern.md`

---

## 1. Overview

### 목적
**파일 탐색(grep/glob/findFiles)과 읽기(read_file)는 모델이 기다리지 않게 확장이 병렬로 수행**한다. 로컬 모델(특히 Flash급)은 한 턴에 도구 여러 개를 호출하지 않는 경향이 있어, 확장이 `Promise.all`로 선실행해 컨텍스트에 주입한다.

### 비즈니스 가치
- **체감 속도 3~5배 향상**: 모델이 도구 호출→응답→다음 도구 루프를 돌 필요 없음
- **중급 모델 보완**: 도구 호출 능력이 약한 모델도 "이미 조사된 컨텍스트"만으로 판단 가능
- **토큰 절약**: 도구 호출/결과 왕복 토큰 제거

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "로그인 플로우 전체 보여줘"라고 하면 0.5초 만에 관련 파일 15개가 컨텍스트에 떠 있길 원한다 |
| US-02 | 에이전트로서, 사용자 메시지에서 심볼/경로/에러 스택을 뽑아 모델 호출 전에 선조사하고 싶다 |
| US-03 | 팀 리더로서, 대용량 모노레포(5만 파일)에서 grep이 2초 안에 끝나길 원한다 |

---

## 2. Functional Requirements

### 2.1 프리페치 파이프라인 (Prefetch Pipeline)

```
사용자 메시지 수신
    │
    ▼
┌─────────────────────────────────────┐
│  경로/심볼/스택 추출 (정규식 + LSP)   │
│  - @file:path, @folder:path         │
│  - import/require 경로              │
│  - 에러 스택 트레이스 파일:라인      │
│  - camelCase/PascalCase 심볼 추정    │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  조사 플랜 수립                      │
│  1) 명시적 @멘션 → read_file        │
│  2) 심볼 → lsp_definition + grep    │
│  3) 에러 스택 → 해당 파일:라인 읽기  │
│  4) 경로 패턴 → glob → read_file    │
│  5) 키워드 → grep (상위 N개 읽기)   │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  병렬 실행 (p-limit 16)              │
│  - read_file: Promise.allSettled    │
│  - grep: ripgrep 멀티 패턴 동시     │
│  - glob: findFiles 배치             │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  결과 합성 → "이미 조사된 컨텍스트"   │
│  - 파일별 요약 (첫 50줄 + 매칭 줄)   │
│  - 시스템 메시지 옆에 블록 주입      │
└─────────────────────────────────────┘
    │
    ▼
모델 호출 (도구는 추가 조사·수정용만)
```

### 2.2 추출 휴리스틱 (`src/prefetch/extractors.ts`)

```typescript
export function extractPathsAndSymbols(text: string): PrefetchPlan {
  const plan: PrefetchPlan = {
    explicitMentions: [],      // @file:, @folder:, @symbol:
    stackTraces: [],           // at func (file.ts:123)
    importPaths: [],           // from './utils' import
    camelCaseSymbols: [],      // getUserToken, UserService
    keywords: [],              // 에러 메시지 키워드
  };

  // 1. @멘션 파싱
  const mentionRegex = /@(file|folder|symbol|codebase):([^\s]+)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    plan.explicitMentions.push({ type: match[1], path: match[2] });
  }

  // 2. 스택 트레이스 (Node/Python/Go/Rust 공통 패턴)
  const stackRegex = /at\s+(\S+)\s+\(?([\w\/\.-]+):(\d+):(\d+)\)?/g;
  while ((match = stackRegex.exec(text)) !== null) {
    plan.stackTraces.push({ func: match[1], file: match[2], line: +match[3] });
  }

  // 3. Import 경로 (TS/JS/Python/Go/Rust)
  const importRegex = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  while ((match = importRegex.exec(text)) !== null) {
    plan.importPaths.push(match[1]);
  }

  // 4. 카멜/파스칼 케이스 심볼 (최소 2단어, 5자 이상)
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

const limit = pLimit(16);  // 디스크/메모리 보호

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

### 2.4 컨텍스트 주입 포맷

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
<file path="src/auth/token.ts" lines="45-60">
```ts
// ... (grep match for "jwt")
export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}
```
</file>
<grep pattern="AuthError" files="3" matches="7">
src/auth/errors.ts:12: export class AuthError extends Error
src/auth/login.ts:8: throw new AuthError('User not found')
src/auth/middleware.ts:23: catch (e) { if (e instanceof AuthError) ...
</grep>
</investigated_context>
```

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 프리페치 완료 시간 | P99 < 800ms (로컬 SSD, 5만 파일 기준) |
| NFR-02 | 동시 파일 읽기 | 16개 동시, 총 50개 파일 < 500ms |
| NFR-03 | ripgrep 검색 | 멀티 패턴 10개 동시 < 1초 (전체 워크스페이스) |
| NFR-04 | 메모리 사용량 | 프리페치 버퍼 < 50MB |
| NFR-05 | 모델 컨텍스트 오버헤드 | 주입 블록 < 8k tokens (자동 요약/절단) |

---

## 4. API & Technical Spec

### 4.1 VS Code API 활용

| API | 용도 |
|-----|------|
| `vscode.workspace.findFiles(glob, exclude)` | glob/패턴 기반 파일 탐색 |
| `vscode.workspace.fs.readFile(uri)` | 바이너리 안전 읽기 |
| `vscode.workspace.findTextInFiles(query)` | 내부 텍스트 검색 (ripgrep 없음 폴백) |
| `child_process.spawn('rg', [...])` | ripgrep 직접 호출 (성능) |
| `vscode.languages.getDefinitionProvider` | LSP 정의 점프 |
| `p-limit` (npm) | 동시성 제어 |

### 4.2 ripgrep 병렬 멀티 패턴

```bash
# 단일 rg 호출로 다중 패턴 검색 (--regexp 다중)
rg --json --no-heading --line-number \
  -e "pattern1" -e "pattern2" -e "pattern3" \
  -g "*.ts" -g "*.js" \
  .
```

```typescript
// JSON 스트림 파싱 → 파일별 매칭 그룹화
for await (const line of rgStdout) {
  const match = JSON.parse(line);
  if (match.type === 'match') {
    resultsByFile[match.data.path.text].push({
      line: match.data.line_number,
      column: match.data.absolute_offset,
      text: match.data.lines.text,
    });
  }
}
```

### 4.3 Staleness 방지 (읽은 뒤 수정 방지)

```typescript
interface FileSnapshot {
  uri: vscode.Uri;
  mtime: number;        // fs.stat.mtimeMs
  hash: string;         // xxhash64(content)
}

const snapshotCache = new Map<string, FileSnapshot>();

async function readFileWithStalenessCheck(uri: vscode.Uri): Promise<string> {
  const cached = snapshotCache.get(uri.fsPath);
  const stat = await vscode.workspace.fs.stat(uri);
  
  if (cached && cached.mtime === stat.mtime) {
    return cached.content;  // 변경 없음, 캐시 반환
  }
  
  const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  const hash = xxhash64(content);
  snapshotCache.set(uri.fsPath, { uri, mtime: stat.mtime, hash, content });
  return content;
}
```

---

## 5. UI/UX Specification

### 5.1 프리페치 진행 인디케이터 (채팅 헤더)
```
🔍 Prefetching...  [████████░░] 8/12 files  (450ms)
  ├─ @file:src/auth.ts ✓
  ├─ grep: "login" ✓
  ├─ symbol: UserService ████░░
  └─ stack: auth.ts:42 ✓
```

### 5.2 디버그 뷰 (Command Palette: "Agent K: Show Prefetch Log")
```
[2024-01-15 14:32:10] Prefetch started for message #42
[2024-01-15 14:32:10] Extracted: 2 mentions, 3 symbols, 1 stack trace
[2024-01-15 14:32:10] Tasks queued: 14 (limit=16)
[2024-01-15 14:32:10] read_file src/auth.ts: 1.2ms
[2024-01-15 14:32:10] grep "login": 45ms, 23 matches in 8 files
[2024-01-15 14:32:10] lsp_definition UserService: 12ms, 1 location
[2024-01-15 14:32:10] Prefetch complete: 14/14 succeeded, 842ms total
[2024-01-15 14:32:10] Injected context: 3 files, 1 grep summary (4.2k tokens)
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Parallel File Search and Prefetch

  Scenario: Prefetch extracts @mentions and reads files in parallel
    Given user sends "@file:src/auth.ts @file:src/token.ts explain the flow"
    When prefetch runs
    Then both files are read via Promise.all
    And content is injected into context before model call
    And total prefetch time < 200ms

  Scenario: Stack trace triggers targeted file reads
    Given user pastes error stack containing "at login (src/auth.ts:42)"
    When prefetch runs
    Then src/auth.ts lines 32-52 are read
    And context includes the exact error location

  Scenario: Symbol detection finds definitions via LSP
    Given user asks "Where is UserService defined?"
    When prefetch runs
    Then lsp_definition is called for "UserService"
    And definition location is injected into context

  Scenario: ripgrep multi-pattern search completes in parallel
    Given user asks "Find all TODO comments in auth module"
    When prefetch runs grep for "TODO" + "FIXME" + "HACK" simultaneously
    Then all three patterns execute in single rg process
    And results grouped by file within 500ms

  Scenario: Concurrency limit prevents resource exhaustion
    Given a message triggering 50 file reads
    When prefetch runs with p-limit(16)
    Then at most 16 reads run simultaneously
    And memory stays under 50MB

  Scenario: Staleness check avoids stale reads
    Given file was read at turn 3
    And user edits and saves file at turn 4
    When agent reads same file at turn 5
    Then fresh content is fetched (mtime changed)
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-07_Streaming_Tool_Executor.md` | 선행 | 스트리밍 중 도구 선실행 아키텍처 |
| `PRD-Infra-08_Parallel_Serial_Policy.md` | 선행 | 병렬/직렬 분류 정책 |
| `PRD-Harness-09_Prefetch_Pattern.md` | 상위 | 하네스 레벨 프리페치 설계 |
| `ripgrep` (시스템 설치) | 런타임 | 없으면 `findTextInFiles` 폴백 |
| `p-limit` (npm) | 런타임 | 동시성 제어 (MIT) |
| `xxhash-wasm` 또는 `xxhashjs` | 런타임 | 빠른 해시 (Apache 2.0) |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 추출기: @멘션, 스택, Import, 심볼 정규식 | 단위 테스트 100% |
| 2 | 병렬 실행기: p-limit + Promise.allSettled | 100개 파일 읽기 벤치마크 |
| 3 | ripgrep 래퍼: 멀티 패턴 JSON 스트림 파싱 | grep 정확도/속도 검증 |
| 4 | LSP 정의 조회 + glob-읽기 체인 | 심볼→정의→본문 플로우 |
| 5 | 컨텍스트 주입: 시스템 메시지 블록 합성 | 토큰 예산 내 주입 검증 |
| 6 | Staleness 캐시 (mtime + xxhash) | 수정 후 재읽기 정확성 |
| 7 | 디버그 로그 + 상태바 UI | 개발자 가시성 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| ripgrep 미설치 환경 | 중간 | `findTextInFiles` 폴백 (느리지만 동작), 설치 가이드 문서화 |
| 심볼 추출 오탐 (일반 단어) | 낮음 | 최소 길이 5자, 카멜/파스칼 케이스만, 사용 빈도 필터링 |
| 대용량 바이너리 파일 읽기 시도 | 중간 | `read_file`에서 `isBinary` 체크 (첫 8KB null byte 검사) |
| LSP 미지원 언어 | 낮음 | LSP 실패 시 grep 폴백, 로그에 경고만 |
| 컨텍스트 창 초과 (프리페치 과다) | 중간 | 토큰 예산(8k) 초과 시 요약/절단, 우선순위: 멘션 > 스택 > 심볼 > 키워드 |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: 병렬 파일 탐색·읽기**, **병렬 처리 — 파일 탐색·읽기**, **설계 원칙 (DGX + 로컬 LLM)**
- ripgrep JSON 출력: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md#json-output
- VS Code findTextInFiles: https://code.visualstudio.com/api/references/vscode-api#workspace.findTextInFiles
- p-limit: https://github.com/sindresorhus/p-limit