# extensions/agent-k

VS Code extension **assembler** only: activation + commands + contributes + wiring.

도메인 로직 금지. 의존 대상: `host`, `chat-ui`, `core`, `tools`, `providers`, `plan`, `worktree`, `safety`, `shared`.

전환기에는 루트 `package.json` / `src/extension.ts` / `resources/` 가 실제 VSIX 엔트리이다.
이 폴더는 목표 레이아웃 스켈레톤이다.
