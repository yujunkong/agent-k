# @agent-k/chat-ui

Webview React UI. No `vscode` / fs / agent loop / provider HTTP.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-002** | Chat View shell — React entry for `agent-k.chat` |

## Layout

```text
src/
  main.tsx      # createRoot → Shell
  Shell.tsx     # brand + host.hello status; posts ui.ready
  vscodeApi.ts  # acquireVsCodeApi wrapper
  shell.css
esbuild.mjs     # IIFE → dist/ + copy to extensions/agent-k/media
```

## Commands

```bash
npm run build -w @agent-k/chat-ui
npm test -w @agent-k/chat-ui
npm run typecheck -w @agent-k/chat-ui
```
