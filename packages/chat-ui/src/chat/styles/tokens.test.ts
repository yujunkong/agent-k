/**
 * V31-UI-02/03/04 — style contract tests (Node-side; not part of the webview bundle).
 *
 * UI-04: every --ak-* token definition lives in ui/cursor-ui.css :root.
 * UI-03: chat.css has zero color fallbacks; raw hex/rgba fallbacks live only in
 *        the --ak-c-* alias block in cursor-ui.css.
 * UI-02: focus-visible rings + WCAG contrast for the canonical fallback colors.
 *
 * VS Code injects --vscode-* into the webview, so the fallbacks checked here are
 * inert there. These assertions guard the non-webview / variable-missing path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// `import.meta.url` is captured in a variable so Vite's asset-URL rewrite
// (`new URL('…', import.meta.url)` → dev-server URL) does not intercept it.
const BASE = import.meta.url;
const chatCss = readFileSync(new URL('../chat.css', BASE), 'utf8');
const cursorUiCss = readFileSync(new URL('../ui/cursor-ui.css', BASE), 'utf8');

// ---------------------------------------------------------------------------
// UI-04 — single token source
// ---------------------------------------------------------------------------

describe('V31-UI-04 single token source', () => {
  it('chat.css defines no --ak-* tokens', () => {
    const definitions = chatCss.match(/--ak-[a-zA-Z0-9-]+\s*:/g) ?? [];
    expect(definitions).toEqual([]);
  });

  it('cursor-ui.css :root defines the moved tokens', () => {
    const required = [
      '--ak-panel-bg',
      '--ak-card-bg',
      '--ak-danger',
      '--ak-space-1',
      '--ak-ui-surface',
      '--ak-c-focus-border',
    ];
    for (const token of required) {
      expect(cursorUiCss).toMatch(new RegExp(`${token}\\s*:`));
    }
  });
});

// ---------------------------------------------------------------------------
// UI-03 — no color fallbacks in chat.css
// ---------------------------------------------------------------------------

describe('V31-UI-03 no color fallbacks in chat.css', () => {
  it('only the editor font stack keeps a var(--vscode-*, …) fallback', () => {
    const fallbacks = chatCss.match(/var\(\s*--vscode-[a-zA-Z0-9-]+\s*,\s*[^)]*\)/g) ?? [];
    expect(fallbacks.length).toBeGreaterThan(0);
    for (const match of fallbacks) {
      const name = match.match(/--vscode-[a-zA-Z0-9-]+/)?.[0];
      expect(name).toBe('--vscode-editor-font-family');
    }
  });

  it('cursor-ui.css keeps the canonical --ak-c-* fallback mapping', () => {
    const expected: Array<[string, string]> = [
      ['--ak-c-button-background', 'var(--vscode-button-background, #0e639c)'],
      ['--ak-c-button-border', 'var(--vscode-button-border, #555)'],
      ['--ak-c-button-foreground', 'var(--vscode-button-foreground, #fff)'],
      ['--ak-c-button-hover-background', 'var(--vscode-button-hoverBackground, #1177bb)'],
      ['--ak-c-button-secondary-background', 'var(--vscode-button-secondaryBackground, #3a3d41)'],
      ['--ak-c-button-secondary-foreground', 'var(--vscode-button-secondaryForeground, #ccc)'],
      ['--ak-c-button-secondary-hover-background', 'var(--vscode-button-secondaryHoverBackground, #45494e)'],
      ['--ak-c-charts-blue', 'var(--vscode-charts-blue, #4fc1ff)'],
      ['--ak-c-charts-green', 'var(--vscode-charts-green, #89d185)'],
      ['--ak-c-charts-orange', 'var(--vscode-charts-orange, #dea584)'],
      ['--ak-c-charts-purple', 'var(--vscode-charts-purple, #c586c0)'],
      ['--ak-c-charts-red', 'var(--vscode-charts-red, #f14c4c)'],
      ['--ak-c-charts-yellow', 'var(--vscode-charts-yellow, #c6a200)'],
      ['--ak-c-description-foreground', 'var(--vscode-descriptionForeground, #9d9d9d)'],
      ['--ak-c-editor-background', 'var(--vscode-editor-background, #1e1e1e)'],
      ['--ak-c-editor-foreground', 'var(--vscode-editor-foreground, #d4d4d4)'],
      ['--ak-c-editor-inactive-selection-background', 'var(--vscode-editor-inactiveSelectionBackground, rgba(255, 255, 255, 0.03))'],
      ['--ak-c-editor-cursor-foreground', 'var(--vscode-editorCursor-foreground, #aeafad)'],
      ['--ak-c-editor-warning-foreground', 'var(--vscode-editorWarning-foreground, #f59e0b)'],
      ['--ak-c-editor-widget-background', 'var(--vscode-editorWidget-background, var(--ak-c-menu-background))'],
      ['--ak-c-error-foreground', 'var(--vscode-errorForeground, #f48771)'],
      ['--ak-c-focus-border', 'var(--vscode-focusBorder, #007fd4)'],
      ['--ak-c-foreground', 'var(--vscode-foreground, #cccccc)'],
      ['--ak-c-input-background', 'var(--vscode-input-background, #3c3c3c)'],
      ['--ak-c-input-border', 'var(--vscode-input-border, #3c3c3c)'],
      ['--ak-c-input-foreground', 'var(--vscode-input-foreground, #ccc)'],
      ['--ak-c-input-placeholder-foreground', 'var(--vscode-input-placeholderForeground, var(--ak-c-description-foreground))'],
      ['--ak-c-input-validation-warning-border', 'var(--vscode-inputValidation-warningBorder, #b89500)'],
      ['--ak-c-list-active-selection-background', 'var(--vscode-list-activeSelectionBackground, rgba(0, 127, 212, 0.18))'],
      ['--ak-c-list-active-selection-foreground', 'var(--vscode-list-activeSelectionForeground, inherit)'],
      ['--ak-c-list-hover-background', 'var(--vscode-list-hoverBackground, rgba(90, 93, 94, 0.25))'],
      ['--ak-c-menu-background', 'var(--vscode-menu-background, var(--ak-c-editor-background))'],
      ['--ak-c-panel-border', 'var(--vscode-panel-border, #555)'],
      ['--ak-c-progress-bar-background', 'var(--vscode-progressBar-background, #3794ff)'],
      ['--ak-c-side-bar-background', 'var(--vscode-sideBar-background, #252526)'],
      ['--ak-c-side-bar-foreground', 'var(--vscode-sideBar-foreground, #ccc)'],
      ['--ak-c-testing-icon-passed', 'var(--vscode-testing-iconPassed, var(--ak-c-charts-green))'],
      ['--ak-c-text-code-block-background', 'var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.12))'],
      ['--ak-c-text-link-foreground', 'var(--vscode-textLink-foreground, #4daafc)'],
      ['--ak-c-toolbar-hover-background', 'var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31))'],
      ['--ak-c-widget-border', 'var(--vscode-widget-border, #454545)'],
      ['--ak-c-widget-shadow', 'var(--vscode-widget-shadow, #000)'],
    ];
    for (const [token, definition] of expected) {
      expect(cursorUiCss).toContain(`${token}: ${definition};`);
    }
  });
});

// ---------------------------------------------------------------------------
// UI-02 — focus-visible contract
// ---------------------------------------------------------------------------

const FOCUS_SELECTORS = [
  '.mode-selector--btn',
  '.model-selector--btn',
  '.model-selector__filter-input',
  '.composer-thinking-select',
  '.thinking-selector',
  '.composer-icon-btn',
  '.settings-search__input',
  '.settings-field input',
  '.chat-tab__close',
];

interface FocusRule {
  selectors: string[];
  body: string;
}

/** Extract every `selector { … }` block whose selector list mentions :focus-visible. */
function focusVisibleRules(css: string): FocusRule[] {
  const rules: FocusRule[] = [];
  const re = /([^{}]*:focus-visible[^{}]*)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    rules.push({
      selectors: match[1].split(',').map((selector) => selector.trim()),
      body: match[2],
    });
  }
  return rules;
}

describe('V31-UI-02 focus-visible contract', () => {
  const rules = focusVisibleRules(chatCss);

  it('every audited control has a 2px focus ring', () => {
    for (const selector of FOCUS_SELECTORS) {
      const matching = rules.filter((candidate) =>
        candidate.selectors.some((part) => part.startsWith(`${selector}:focus-visible`)),
      );
      expect(matching.length, `missing :focus-visible rule for ${selector}`).toBeGreaterThan(0);
      const hasRing = matching.some(
        (rule) =>
          /outline:\s*2px\s+solid\s+var\(--ak-c-focus-border\)/.test(rule.body) ||
          /outline-width:\s*2px/.test(rule.body),
      );
      expect(hasRing, `${selector} focus ring must be 2px`).toBe(true);
    }
  });

  it('no :focus-visible block removes the outline', () => {
    for (const rule of rules) {
      expect(rule.body).not.toMatch(/outline\s*:\s*none/);
    }
  });
});

// ---------------------------------------------------------------------------
// UI-02 — WCAG contrast of the canonical fallback colors
// ---------------------------------------------------------------------------

// These are the canonical fallback values used when VS Code does not inject
// --vscode-* (non-webview / storybook / tests). Real themes inject their own
// values, so this only checks the worst-case fallback path.

/** WCAG 2.x relative luminance for a #rrggbb color. */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  const [r, g, b] = channels.map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('V31-UI-03 chat.css has no raw color fallbacks', () => {
  it('does not embed hex or rgba inside var()', () => {
    const raw = chatCss.match(/var\([^)]*#[0-9a-fA-F]{3,8}/g) ?? [];
    const rgba = chatCss.match(/var\([^)]*rgba?\(/g) ?? [];
    expect(raw).toEqual([]);
    expect(rgba).toEqual([]);
  });
});

describe('V31-UI-06 explore !important', () => {
  it('explore selectors keep a single padding reset', () => {
    const src = chatCss.replace(/\/\*[\s\S]*?\*\//g, '');
    let n = 0;
    for (const block of src.split('}')) {
      const brace = block.lastIndexOf('{');
      if (brace < 0) continue;
      const sel = block.slice(0, brace);
      const body = block.slice(brace + 1);
      if (!sel.includes('.ak-explore')) continue;
      n += body.match(/!important/g)?.length ?? 0;
    }
    expect(n).toBe(1);
  });
});

describe('V31-UI-08 mode label stays visible when narrow', () => {
  it('480px rules truncate the label and do not set display:none', () => {
    const narrow = chatCss.slice(chatCss.indexOf('@container ak-chat (max-width: 480px)'));
    const label = narrow.slice(narrow.indexOf('.mode-selector__label'), narrow.indexOf('.composer-toolbar__left'));
    expect(label).toContain('text-overflow: ellipsis');
    expect(label).not.toContain('display: none');
  });
});

describe('V31-UI-02 WCAG contrast of canonical fallbacks', () => {
  it('focus ring fallback #007fd4 clears 3:1 on light and dark surfaces', () => {
    expect(contrastRatio('#007fd4', '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#007fd4', '#1e1e1e')).toBeGreaterThanOrEqual(3);
  });

  it('light-theme text pairs clear 4.5:1', () => {
    expect(contrastRatio('#333333', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#717171', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', '#0e639c')).toBeGreaterThanOrEqual(4.5);
  });

  it('dark-theme text pairs clear 4.5:1', () => {
    expect(contrastRatio('#cccccc', '#1e1e1e')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#9d9d9d', '#1e1e1e')).toBeGreaterThanOrEqual(4.5);
  });
});
