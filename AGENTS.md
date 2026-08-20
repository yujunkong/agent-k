# Agent-K — Agent Boundaries

Canonical guide: `docs/architecture/AGENT-K-MONOREPO-FINAL.md`  
Feature Master: `AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md` (v2.1-PRODUCTION-MODE)

**원칙:** published npm lib보다 **모노레포 패키지 경계 + 경로별 에이전트 가드레일**을 우선한다.

## B-0. 최상위 원칙

1. **한 세션 = 한 도메인** — 가능하면 `packages/<one>` 또는 `extensions/agent-k` 하나만 수정
2. **Feature ID 기준** — 작업 시작 시 ID 명시 (예: AGENT-010, CHAT-002)
3. **경계 존중** — 경계를 넘으면 먼저 `packages/shared` 타입/프로토콜
4. **복사 이식 금지** — 파일 단위 복사가 아니라 Feature ID 단위 이식

> 전환 중: 구현 상당수는 아직 `src/<domain>/`에 있다. 아래 표의 **역할/금지**가 소유권이며, 물리 경로는 stub README의 `owns`를 따른다.
>
> **v3.0 진행:** Phase 0 `@agent-k/shared` 추출됨 (protocol / workEvent / subagentResult). Phase 1 `@agent-k/providers` 추출됨.

## B-1. 패키지 경계 요약

| 경로 | 역할 | 해도 됨 | 하면 안 됨 |
|------|------|---------|------------|
| `packages/chat-ui` | Webview UI | React, CSS, timeline/composer | `vscode`, fs, network, agent loop |
| `packages/host` | Extension Host | `vscode` API, bridge | React UI, agent loop 본문 |
| `packages/core` | Agent runtime | loop, modes, context | React, vscode UI |
| `packages/tools` | Tool executors | tool 구현 | UI, provider HTTP 전체 |
| `packages/providers` | Provider/Model | connections, routing | UI, tool 실행 본문 |
| `packages/plan` | Plan domain (2차) | state machine, execution | chat UI, worktree apply |
| `packages/worktree` | Isolation (2차) | worktree, patch, BoN | chat UI |
| `packages/safety` | Safety (2차) | gate, deny, checkpoint | UI |
| `packages/shared` | types only | pure types, protocol | 비즈니스 로직 |
| `extensions/agent-k` | 조립 | activate, wiring | 도메인 로직 |

## B-2. 금지 사항

- `chat-ui`에서 `vscode` import
- `core` / `tools` / `providers`에 React 컴포넌트
- UI가 자연어 파싱으로 tool/edit 추측 (R-002)
- Composer dropdown과 ModelRouter를 한 모듈에 섞기 (R-001)
- Worktree 부분 적용 후 rollback 없음 (R-003)
- Plan을 prompt 한 방으로 대체 (R-004)
- Tool contract 없는 tool 추가 (R-005)

## B-3. 작업 시작 체크리스트

```text
[ ] 관련 Feature ID 확인
[ ] 수정할 packages/* 하나만 선택
[ ] 해당 패키지 rule 확인
[ ] shared 변경 필요 시 먼저 shared
[ ] 테스트 경로 확인
[ ] 8항목 체크 (Domain type · Runtime · Host bridge · UI · Config · Error/cancel · Unit · E2E)
```

## B-4. Feature ID → 패키지 빠른 참조

- **EXT-*, HOST-*** → `host` + `extensions/agent-k`
- **CHAT-*, CONV-*, UI-*, CURSOR-*, SET-*(UI)** → `chat-ui`
- **STREAM-(runtime), AGENT-*, MODE-*, CTX-*, HARNESS-*, DEBUG-*, MEM-*, SKILL-*, ART-*, TEL-*, CFG-*, REL-*** → `core`
- **TOOL-*** → `tools`
- **PROVIDER-*, MODEL-*, UXPROV-*** → `providers`
- **PLAN-*, PLAN2-*, EXEC-*** → `plan` (없으면 `core`)
- **WT-*, SUB-*, BON-*, SCM-*** → `worktree` (없으면 `core`)
- **SAFE-*** → `safety` (없으면 `core`/`tools`)
- **INLINE-*** → UI=`chat-ui`, controller=`host`/`core`
- **BROWSER-*, DESIGN-*, MCP-*, GH-*** → 로직=`core`/전용, UI=`chat-ui`, bridge=`host`

## B-5. 커밋 메시지 예

```text
feat(core): AGENT-010 doom loop detection
fix(chat-ui): CONV-014 timeline step card layout
refactor(providers): R-001 separate ModelRouter from composer picker
```

## 의존성 방향

```text
extensions/agent-k
    ↓
host ──────────────────────────┐
    ↓                          ↓
chat-ui ←── protocol ──→ shared
    ↓                          ↑
core ←─────────────────────────┤
    ↓                          │
tools, providers, plan, worktree, safety
```

**순환 의존 금지.** `shared`는 비즈니스 패키지를 의존하지 않는다.

## 빌드 엔트리 (전환기)

- Extension host: `esbuild.js` → `src/extension.ts` → `dist/extension.js`
- Chat webview: `vite.config.ts` → `src/chat/main.tsx` → `dist/chat.js`
- Providers 구현: `packages/providers` (`src/providers`는 shim)

상세 Phase·Feature 매핑: `docs/architecture/AGENT-K-MONOREPO-FINAL.md`

## Cursor Cloud specific instructions

Agent-K is a VS Code extension (Node 22, npm workspaces). Standard commands live in root `package.json` `scripts` and `esbuild.js` / `vite.config.ts`; the notes below only cover cloud/headless caveats.

- Dependencies: single `npm install` at repo root installs all workspaces (`packages/*`, `extensions/*`). This is the startup update script.
- Lint / types: `npm run lint` and `npm run check-types` run headless. Lint is expected to report 0 errors with a large number of pre-existing `warning`s (curly/eqeqeq/semi) — warnings do not fail the build.
- Build (dev): `node esbuild.js` bundles the extension host → `dist/extension.js`; `npm run build:webview` (vite) bundles the React chat webview → `dist/chat.js` + `dist/chat.css`. The vite build prints benign rollup warnings (`accessSync`/`constants` not exported by `node-shims.ts`, large-chunk warning) and still succeeds.
- Tests that run headless: `npm run test:addon` (~145) and `npm run test:plan-v2` (~92) via tsx+mocha.
- Tests that do NOT run in a plain headless VM: `npm run test:harness` and the default `npm test` (`vscode-test`). They import the real `vscode` module / need the Electron Extension Host, so they only work inside VS Code (or an xvfb + downloaded VS Code harness), not from bare Node.
- Run the app in dev: `npm run dev:webview` starts Vite on `http://localhost:3000` and renders the chat UI standalone in a browser (webview's `vscode` API is shimmed / falls back to null). Composer, slash-command palette, mode switch, and timeline all work in the browser.
- Expected limitation without the Extension Host: sending a message shows "Agent mode needs the Extension Host". Real agent runs require the VS Code Extension Development Host (F5) plus an LLM provider — by default a local LiteLLM proxy → MLX server (`scripts/start-litellm.sh`, `litellm_config.yaml`, upstream MLX on `127.0.0.1:52415`), which is not available in cloud. This is by design, not a setup error.
