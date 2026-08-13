# Agent K

VS Code / Cursor용 로컬·원격 LLM 코딩 에이전트 확장입니다.
commit test
## Features

- Agent / Ask / Plan / Debug 모드
- OpenAI-compatible providers (MLX, LiteLLM, Ollama, LM Studio)
- OpenCode Zen / OpenCode Go
- Tool loop: glob, grep, read, edit, terminal, MCP
- Chat Composer에서 모델 선택

## Requirements

- VS Code / Cursor `^1.125.0`
- OpenAI-compatible endpoint 또는 OpenCode API key

## Quick start

1. Install from VSIX (Extensions → … → Install from VSIX…)
2. Open the **Agent K** activity bar view
3. Settings → Models: set provider Base URL / API key → **Test Connection**
4. Pick a model in the chat Composer

## Settings

- `agent-k.provider.type` — litellm, openai, anthropic, ollama, lmstudio, opencode-zen, opencode-go
- `agent-k.provider.baseUrl` — API base URL (no trailing `/v1`)
- `agent-k.provider.apiKey` — active provider key
- `agent-k.provider.model` — active model id

## License

See repository license.
