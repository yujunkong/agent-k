# `.agentk/` — Agent K project root

설정과 에이전트 관련 정보는 **여기만** 둡니다. (`.agent-k/` 는 쓰지 마세요.)

| Path | Purpose |
|------|---------|
| `settings.json` | 프로젝트 설정 (provider, permissions, features, …). VS Code 설정보다 **우선** 적용 |
| `settings.example.json` | 커밋된 스타터 템플릿 — 복사해 `settings.json`으로 사용 |
| `plans/` | Plan mode 문서 / tmp drafts |
| `debug/` | Debug mode 세션 |
| `checkpoints/` | 롤백 체크포인트 |

## `settings.json` 사용법

1. 예시 복사:
   ```bash
   cp .agentk/settings.example.json .agentk/settings.json
   ```
2. 또는 확장 명령 **Agent K: Open Project Config** / Settings Hub → **JSON** 탭 → Create Example
3. 저장 시 즉시 `ConfigManager`에 반영됩니다.

### 우선순위

```
.agentk/settings.json  >  VS Code User/Workspace settings  >  내장 기본값
```

### 시크릿

`provider.apiKey` / `provider.apiKeys` / `github.token` 은 파일에 넣지 않는 것을 권장합니다.
Settings Hub **Models** 탭 또는 VS Code 시크릿 저장소를 사용하세요.

### 허용 키

중첩 JSON은 `agent-k.*` flat 키로 변환됩니다. 전체 목록은 `src/core/ProjectConfig.ts`의 `PROJECT_CONFIG_KEYS`를 참고하세요.

새 파일·폴더도 모두 `.agentk/` 아래에 추가하세요.
