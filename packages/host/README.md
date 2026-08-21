# @agent-k/host

Extension Host bridge (`vscode` API). No React UI / agent loop body.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-001** | Activation + Activity Bar + Chat webview hello (`ui.ready` → `host.hello`) |

## Layout

```text
src/
  activate.ts              # registerWebviewViewProvider
  ChatViewProvider.ts      # webview lifecycle + message bridge
  helloHtml.ts             # Phase 0 inline HTML (no chat-ui)
  replyToWebviewMessage.ts # pure handshake helper
  nonce.ts                 # CSP nonce (EXT-004 subset)
```

## Commands

```bash
npm test -w @agent-k/host
npm run typecheck -w @agent-k/host
```

Assembler: `extensions/agent-k` (contributes + thin `activate`).
