# extensions/agent-k

VSIX assembler only — activation + contributes + wiring.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-001** | `activate` → `@agent-k/host`, Activity Bar + `agent-k.chat` |
| **EXT-002** | Loads Chat UI shell from `media/chat.js` (built by `@agent-k/chat-ui`) |
| **EXT-003** | `contributes.commands` / menus / keybindings (19 commands) |
| **EXT-004** | CSP/nonce applied via host `getWebviewHtml` |
| **EXT-005** | Workspace paths handled in `@agent-k/host` |

## Build webview assets

```bash
npm run build:webview   # from repo root
```

Writes `media/chat.js` + `media/chat.css`.
