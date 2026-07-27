# C0 Settings Hub re-verification (RW-P0-07)

> Generated: 2026-07-25 · Evidence: `package.json`, `src/core/ConfigManager.ts`, `src/settings/*`, `tests/e2e/c0-settings-hub.spec.ts`, `src/extension.ts`

## Scope

Re-check DONE claims for **C0-T33 … C0-T39** against current `src/` (not DONE JSON alone).

## PASS/FAIL matrix

| Task ID | Title (short) | Result | Evidence / gap |
|---------|---------------|--------|----------------|
| **C0-T33** | ConfigManager + `agent-k.*` schema | **PASS** (keys) / **PARTIAL** (validation) | `ConfigManager.ts` defaults align with PRD queue keys (`onStop=keep`). `package.json` contributes **33** `agent-k.*` properties (≥20 claim). No dedicated JSON-schema validator beyond VS Code contribution types. |
| **C0-T34** | Open Settings command + header ⚙ | **PARTIAL** | `agent-k.openSettings` in `extension.ts` opens **native** `workbench.action.openSettings` (`agent-k` filter). Chat header ⚙ in `ChatApp.tsx` toggles in-chat `SettingsPanel` webview — two entry paths; PRD-29 webview hub vs native split. |
| **C0-T35** | Settings Hub webview shell | **PASS** | `SettingsPanel.tsx`: **9** nav tabs (Models, Secrets, Permission, Features, Harness, Context, MCP, Queue, Privacy). ConfigManager wired from tab components. |
| **C0-T36** | Models/Providers tab | **PASS** | `ModelsTab.tsx` exists; provider type/URL/model + save via `configManager.update`. Connection test UI present (depends on runtime fetch). |
| **C0-T37** | Secrets tab (SecretStorage only) | **FAIL** | `SecretsTab.tsx` reads/writes via `configManager.update` / `get`, not VS Code `SecretStorage` API. Masking UI exists; **settings.json / in-memory config path** — does not meet “SecretStorage only” AC without extension-host bridge. **Note (RW-P0-07):** tab header documents interim `configManager` path until SecretStorage bridge lands. |
| **C0-T38** | Queue settings tab | **PASS** | `QueueTab.tsx`: `onEnterWhileRunning` default resynthesize, `onStop` default **keep**, debounce ms; labels use **Interrupt & Resynthesize**. |
| **C0-T39** | E2E Settings Hub | **FAIL** | `tests/e2e/c0-settings-hub.spec.ts` is **in-process mock** (Map store, hard-coded defaults) — no webview, no `openSettings`, no Playwright/vscode-test driver. File exists but does not prove green E2E in extension host. |

## Recommended follow-up

| Priority | Action |
|----------|--------|
| P0 | Wire `SecretsTab` to extension `SecretManager` / VS Code `SecretStorage`; keep keys out of `contributes.configuration` plaintext. |
| P1 | Unify settings entry: either PRD webview-only or document native+webview dual path in DONE descriptions. |
| P1 | Replace C0-T39 mocks with vscode-test or documented manual checklist + grep proof. |
| P2 | Add optional ConfigManager validation helper if AC requires explicit schema checks. |

## Re-run checklist

```bash
# Config key count
grep -c '"agent-k\.' package.json

# Queue defaults
grep -E "onStop|onEnterWhileRunning" src/core/ConfigManager.ts src/settings/tabs/QueueTab.tsx

# E2E file (inspect for mocks)
head -40 tests/e2e/c0-settings-hub.spec.ts
```
