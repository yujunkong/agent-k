# @agent-k/chat-ui

Webview React UI ported from `v2.1-PRODUCTION-MODE` (chat + settings + CSS).

Host talks via `postMessage` (`host/vscodeApi`). Real `vscode` / Node builtins are shimmed at build time (v2.1 vite parity).

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-002** | Chat View entry (`#chat-root`) + media bundle |
| **CHAT-001…** | `src/chat/ChatApp.tsx` + components |
| **SET-001…** | `src/settings/SettingsPanel.tsx` + tabs |
| **UI-*** | Presentational components under `src/chat/components` |

## Layout

```text
src/
  chat/            # v2.1 src/chat (ChatApp, CSS, components, hooks, …)
    main.tsx       # entry — imports chat.css + ui/*.css
    chat.css
    ui/*.css
  settings/        # v2.1 src/settings
  core|plan|…/     # webview-reachable modules (shimmed / ported for UI)
esbuild.mjs        # IIFE → dist/ + copy to extensions/agent-k/media
```

## Commands

```bash
npm run build -w @agent-k/chat-ui
npm test -w @agent-k/chat-ui
```

## See it

1. `npm run build -w @agent-k/chat-ui`
2. F5 → **Run Agent K Extension**
3. Activity Bar → **Agent K** → Chat / Settings

Bundled CSS should be ~126KB+ (full v2.1 `chat.css` + ui layers).
