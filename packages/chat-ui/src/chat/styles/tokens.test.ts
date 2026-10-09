/**
 * V31-UI-02/03/04 — style contract tests (Node-side; not in the webview bundle).
 *
 * UI-02: focus-visible rings use 2px focusBorder; mode pill no longer kills the ring.
 * UI-03: chat.css must not redefine --vscode-* (light-theme break).
 * UI-04: --ak-* token definitions live in ui/cursor-ui.css :root.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const BASE = import.meta.url;
const chatCss = readFileSync(new URL('../chat.css', BASE), 'utf8');
const cursorUiCss = readFileSync(new URL('../ui/cursor-ui.css', BASE), 'utf8');
const focusCss = readFileSync(new URL('./focus.css', BASE), 'utf8');

describe('V31-UI-03 no --vscode-* :root overrides in chat.css', () => {
  it('does not hardcode dark --vscode-* on :root', () => {
    expect(chatCss).not.toMatch(
      /:root\s*\{[^}]*--vscode-editor-background\s*:\s*#/s,
    );
    expect(chatCss).not.toContain('--vscode-editor-background: #1e1e1e');
    expect(chatCss).not.toContain('--vscode-input-background: #3c3c3c');
  });
});

describe('V31-UI-04 single token source', () => {
  it('chat.css defines no --ak-* tokens', () => {
    const definitions = chatCss.match(/--ak-[a-zA-Z0-9-]+\s*:/g) ?? [];
    expect(definitions).toEqual([]);
  });

  it('cursor-ui.css :root owns panel/card/focus tokens', () => {
    const required = [
      '--ak-panel-bg',
      '--ak-card-bg',
      '--ak-space-1',
      '--ak-ui-surface',
      '--ak-c-focus-border',
      '--ak-divider',
      '--ak-thread-inset',
    ];
    for (const token of required) {
      expect(cursorUiCss).toMatch(new RegExp(`${token}\\s*:`));
    }
  });
});

describe('V31-UI-14/15 type scale + chip palette', () => {
  it('defines --ak-fs-xs…xl with floor 11px', () => {
    expect(cursorUiCss).toMatch(/--ak-fs-xs:\s*11px/);
    expect(cursorUiCss).toMatch(/--ak-fs-sm:\s*12px/);
    expect(cursorUiCss).toMatch(/--ak-fs-md:\s*13px/);
    expect(cursorUiCss).toMatch(/--ak-fs-lg:\s*14px/);
    expect(cursorUiCss).toMatch(/--ak-fs-xl:\s*15px/);
  });

  it('defines chip palette tokens', () => {
    for (const token of [
      '--ak-chip-file-bg',
      '--ak-chip-folder-bg',
      '--ak-chip-log-bg',
      '--ak-accent',
    ]) {
      expect(cursorUiCss).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it('chat.css has no bare font-size below 11px', () => {
    // Comment: token defs live in cursor-ui; chat.css must use var(--ak-fs-*).
    expect(chatCss).not.toMatch(/font-size:\s*(?:[0-9]|10)(?:\.\d+)?px/);
  });
});

describe('V31-UI-16 chrome carve-out', () => {
  it('main.tsx imports history/settings/thread style modules', () => {
    const main = readFileSync(new URL('../main.tsx', BASE), 'utf8');
    expect(main).toContain("import './styles/history-rail.css'");
    expect(main).toContain("import './styles/settings-hub.css'");
    expect(main).toContain("import './styles/thread-chrome.css'");
  });
});

describe('V31-UI-02 focus-visible contract', () => {
  const FOCUS_SELECTORS = [
    '.mode-selector--btn',
    '.model-selector--btn',
    '.model-selector__filter-input',
    '.chat-icon-btn',
    '.settings-open-btn',
    '.settings-close',
    '.settings-search__input',
    '.settings-tab',
    '.settings-switch',
    '.composer-icon-btn',
  ];

  it('focus.css declares 2px gray rings for composer chrome controls', () => {
    for (const sel of FOCUS_SELECTORS) {
      expect(focusCss).toContain(`${sel}:focus-visible`);
    }
    expect(focusCss).toMatch(/outline:\s*2px\s+solid/);
    expect(focusCss).toMatch(/--ak-focus-ring/);
  });

  it('mode-selector no longer clears :focus-visible outline', () => {
    // Comment: old rule set outline:none on :focus-visible — WCAG 2.4.7 fail.
    expect(chatCss).not.toMatch(
      /\.mode-selector--btn:focus-visible[^{]*\{[^}]*outline:\s*none/s,
    );
  });
});
