# extensions/agent-k

VSIX **assembler** for Agent-K.

Today the VS Code extension `package.json`, `resources/`, and build entry still live at the
**repository root** (required for existing packaging scripts). The target layout moves
contributes + `esbuild` entry here while depending on workspace packages:

- `@agent-k/host` — activation / ChatViewProvider
- `@agent-k/chat-ui` — webview bundle input
- `@agent-k/core` / `@agent-k/tools` / `@agent-k/providers` / `@agent-k/mcp`

Do not publish workspace packages to npm unless an external consumer needs them.
