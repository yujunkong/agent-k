# `.agentk/` — Agent K project root

설정과 에이전트 관련 정보는 **여기만** 둡니다. (`.agent-k/` 는 쓰지 마세요.)

| Path | Purpose |
|------|---------|
| `settings.json` | 프로젝트 설정 (provider, permissions, features, …). VS Code 전역 설정보다 **우선**. |
| `settings.example.json` | 예시 + `$schema` 참조 |
| `settings.schema.json` | JSON Schema (에디터 자동완성) |
| `plans/` | Plan mode 문서 / tmp drafts |
| `debug/` | Debug mode 세션 |
| `checkpoints/` | 롤백 체크포인트 |

**우선순위 (OpenCode와 유사):** VS Code User/Workspace `agent-k.*` ← `.agentk/settings.json`이 덮어씀.

API 키는 프로젝트 JSON에 넣지 말고 Settings → **Provider** 탭에 두세요.

새 파일·폴더도 모두 `.agentk/` 아래에 추가하세요.
