# @agent-k/chat-ui

Webview React UI. No `vscode` / fs / agent loop / provider HTTP.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-002** | Chat View entry (`#chat-root`) |
| **CHAT-001** | Chat application shell (header · messages · footer) |
| **CHAT-002** | Composer (mode + model field + send → `chat.send`) |

## Layout

```text
src/
  main.tsx         # createRoot → ChatApp
  ChatApp.tsx      # CHAT-001 shell + host.hello / chat.stream
  Composer.tsx     # CHAT-002
  MessageList.tsx  # empty state + bubbles
  chatApp.css
  vscodeApi.ts
esbuild.mjs        # IIFE → dist/ + copy to extensions/agent-k/media
```

## Commands

```bash
npm run build -w @agent-k/chat-ui
npm test -w @agent-k/chat-ui
npm run typecheck -w @agent-k/chat-ui
```

## See it in VS Code

1. `npm run build -w @agent-k/chat-ui` (already copies into `extensions/agent-k/media`)
2. Open this repo in VS Code / Cursor
3. Run **Extension: Agent K** (F5 / Run Extension) against `extensions/agent-k`
4. Activity bar → **Agent K** → **Chat**
5. Status should show Connected; type a message and Send
   - User bubble appears locally
   - Host replies with stub stream error until AGENT loop is wired in host
