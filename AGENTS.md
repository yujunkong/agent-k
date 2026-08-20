# Agent-K — Agent Boundaries

이 레포는 VS Code 확장 **하나**이지만 도메인이 많습니다.
에이전트는 **한 작업 = 한 도메인(패키지)** 으로 제한하세요. published npm lib 분리는 재사용·버전 분리가 필요할 때만 합니다.

## 목표 구조 (모노레포)

```text
extensions/agent-k/     # VSIX 조립만 (contributes, activate, 번들 엔트리)
packages/chat-ui/       # webview React UI
packages/host/          # Extension Host / VS Code API
packages/core/          # harness · agent loop · config · 도메인 런타임
packages/tools/         # 도구 레지스트리 · executors
packages/providers/     # LLM 프로바이더 · 모델 라우팅
packages/mcp/           # MCP 클라이언트 · bootstrap
```

현재 소스의 상당수는 아직 `src/<domain>/` 에 있습니다.
물리 이동은 점진적으로 하며, **소유권·수정 경계는 아래 표를 따릅니다.**

## 도메인 소유권 (현재 경로 → 패키지)

| 작업 종류 | 볼 곳 (현재) | 목표 패키지 | 건드리면 안 되는 곳 |
|-----------|--------------|-------------|---------------------|
| Chat UI / webview | `src/chat/**`, `src/settings/**`(패널) | `@agent-k/chat-ui` | `src/host/**`, `src/loop/**`, `src/tools/executors*` |
| Extension host | `src/host/**`, `src/extension.ts` | `@agent-k/host` | `src/chat/components/**`, Vite-only UI |
| Harness / agent runtime | `src/harness/**`, `src/loop/**`, `src/agent/**`, `src/core/**` | `@agent-k/core` | chat CSS/컴포넌트, settings tabs UI |
| Tools | `src/tools/**` | `@agent-k/tools` | chat UI, providers 구현체 내부 |
| Providers / models | `packages/providers/**` (shim: `src/providers/**`) | `@agent-k/providers` | chat 레이아웃, tool executor 본문 |
| MCP | `src/mcp/**` | `@agent-k/mcp` | chat UI, host webview HTML |
| Plan / Debug / Review | `src/plan/**`, `src/debug/**`, `src/review/**` | feature (core/host 경유) | 무관한 도메인 전면 리팩터 |

## 의존 방향 (강제)

```text
chat-ui  →  types/protocol · providers(타입·상태 UI)만
host     →  core, tools, providers, mcp, features
tools    →  core/types  (chat-ui 금지, providers 구현 금지)
providers →  core/config · types만  (tools/host/chat 금지)
mcp      →  tools 등록 API만  (UI 금지)
core     →  chat-ui 금지
extension →  host 조립만
```

## 작업 규칙

1. **한 PR / 한 세션 = 한 도메인.** UI 버그에 host·tools를 같이 바꾸지 마세요.
2. 경계 너머가 필요하면 **protocol / types / 작은 헬퍼 추출** 후 양쪽에 import. 도메인 폴더를 서로 끌어오지 마세요.
3. `src/chat` 은 브라우저 번들입니다. Node/`vscode` API가 필요하면 host로 옮기거나 `postMessage` protocol을 확장하세요.
4. `tools` → `chat` 역의존(예: normalize/diff 헬퍼)을 새로 만들지 마세요. 헬퍼는 tools 또는 shared types로 올리세요.
5. published lib(`npm publish`)는 **다른 확장/앱이 쓸 안정 API**가 생길 때만. 그 전에는 workspace 패키지로 충분합니다.

## 빌드 엔트리 (변경 시 주의)

- Extension host: `esbuild.js` → `src/extension.ts` → `dist/extension.js`
- Chat webview: `vite.config.ts` → `src/chat/main.tsx` → `dist/chat.js`
- 패키지 이동 후에도 **번들 엔트리는 extensions/agent-k가 조립**하는 형태를 유지합니다.

## 상세

- 마이그레이션 순서·사이클 목록: `docs/architecture/MONOREPO_SPLIT.md`
- 경로별 Cursor rules: `.cursor/rules/*.mdc`
