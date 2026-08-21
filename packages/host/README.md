# @agent-k/host

Extension Host bridge (`vscode` API). No React UI / agent loop body.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-001** | Activation + Activity Bar + Chat webview hello (`ui.ready` → `host.hello`) |
| **EXT-002** | Chat View shell HTML loader (`media/chat.js`) |
| **EXT-003** | Command catalog registration (19 commands + menus/keybindings) |
| **EXT-004** | CSP / nonce / `getWebviewHtml` |
| **EXT-005** | Workspace path abstraction (`workspacePaths`) |

## Layout

```text
src/
  activate.ts              # registerWebviewViewProvider + commands
  ChatViewProvider.ts      # webview lifecycle + EXT-003 stubs
  commandIds.ts            # EXT-003 id catalog
  registerCommands.ts      # EXT-003 vscode.commands wiring
  webviewHtml.ts           # EXT-004 HTML + CSP document
  webviewCsp.ts            # EXT-004 CSP string builder
  nonce.ts                 # EXT-004 getNonce
  workspacePaths.ts        # EXT-005 path normalize/validate
  replyToWebviewMessage.ts # pure handshake helper
```

## Commands

```bash
npm test -w @agent-k/host
npm run typecheck -w @agent-k/host
```

Assembler: `extensions/agent-k` (contributes + thin `activate`).
