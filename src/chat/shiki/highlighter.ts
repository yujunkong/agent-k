import { createHighlighter, createJavaScriptRegexEngine, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let loadPromise: Promise<Highlighter> | null = null;
let loadFailed = false;

const SUPPORTED_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx', 'python', 'rust', 'go',
  'java', 'kotlin', 'swift', 'ruby', 'php', 'c', 'cpp', 'csharp',
  'html', 'css', 'scss', 'json', 'yaml', 'markdown', 'bash', 'shell',
  'sql', 'graphql', 'diff', 'dockerfile', 'toml', 'xml', 'plaintext'
] as const;

/** Common fence aliases → Shiki language id */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  python3: 'python',
  rs: 'rust',
  golang: 'go',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  bash: 'bash',
  yml: 'yaml',
  md: 'markdown',
  csharp: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  kt: 'kotlin',
  rb: 'ruby',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext'
};

export function getSupportedLanguages(): string[] {
  return [...SUPPORTED_LANGS];
}

export function normalizeLang(lang: string): string {
  const raw = (lang || '').trim().toLowerCase();
  if (!raw) return 'plaintext';
  return LANG_ALIASES[raw] || raw;
}

export async function getHighlighterInstance(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (loadFailed) {
    throw new Error('shiki load previously failed');
  }
  if (loadPromise) return loadPromise;

  loadPromise = createHighlighter({
    langs: SUPPORTED_LANGS as any,
    // Cursor-like token colors (richer than dark-plus mono look)
    themes: ['github-dark', 'github-light'],
    engine: createJavaScriptRegexEngine()
  })
    .then((hl) => {
      highlighter = hl;
      return hl;
    })
    .catch((err) => {
      loadFailed = true;
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

export function highlightCode(code: string, lang: string, isDark: boolean): Promise<string> {
  const normalizedLang = normalizeLang(lang);
  return getHighlighterInstance()
    .then((hl) => {
      try {
        const loaded = hl.getLoadedLanguages();
        const langExists = loaded.includes(normalizedLang as any);
        const useLang = langExists ? normalizedLang : 'plaintext';
        return hl.codeToHtml(code, {
          lang: useLang,
          theme: isDark ? 'github-dark' : 'github-light'
        });
      } catch {
        return fallbackHighlight(code, normalizedLang, isDark);
      }
    })
    .catch(() => fallbackHighlight(code, normalizedLang, isDark));
}

export function isHighlighterReady(): boolean {
  return highlighter !== null;
}

/** Lightweight keyword highlight when Shiki is unavailable */
function fallbackHighlight(code: string, lang: string, isDark: boolean): string {
  const kwColor = isDark ? '#F97583' : '#d73a49';
  const strColor = isDark ? '#9ECBFF' : '#032f62';
  const cmtColor = isDark ? '#6A737D' : '#6a737d';
  const fg = isDark ? '#E1E4E8' : '#24292e';
  const bg = isDark ? '#24292e' : '#f6f8fa';

  const keywords: Record<string, string[]> = {
    python: [
      'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
      'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
      'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
      'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
    ],
    javascript: [
      'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
      'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
      'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
      'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
      'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'of'
    ],
    typescript: [],
    rust: [
      'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
      'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
      'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
      'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use',
      'where', 'while'
    ],
    html: [],
    css: []
  };
  keywords.typescript = [...keywords.javascript, 'type', 'interface', 'enum', 'implements', 'readonly', 'namespace'];
  keywords.html = [...keywords.javascript];

  const list = keywords[lang] || keywords.javascript;
  let html = escapeHtml(code);

  // HTML / XML tags
  if (lang === 'html' || lang === 'xml' || lang === 'svg') {
    const tagColor = isDark ? '#85E89D' : '#22863a';
    const attrColor = isDark ? '#B392F0' : '#6f42c1';
    html = html.replace(
      /(&lt;\/?)([\w:-]+)/g,
      `$1<span style="color:${tagColor}">$2</span>`
    );
    html = html.replace(
      /\s([\w:-]+)(=)/g,
      ` <span style="color:${attrColor}">$1</span>$2`
    );
  }

  // comments
  if (lang === 'python') {
    html = html.replace(/(#[^\n]*)/g, `<span style="color:${cmtColor}">$1</span>`);
  } else if (lang !== 'html') {
    html = html.replace(/(\/\/[^\n]*)/g, `<span style="color:${cmtColor}">$1</span>`);
  }
  // strings
  html = html.replace(
    /(&quot;[^&]*&quot;|&#039;[^&]*&#039;|`[^`]*`)/g,
    `<span style="color:${strColor}">$1</span>`
  );
  if (list.length && lang !== 'html' && lang !== 'css') {
    const re = new RegExp(`\\b(${list.join('|')})\\b`, 'g');
    html = html.replace(re, `<span style="color:${kwColor}">$1</span>`);
  }

  return `<pre class="shiki fallback" style="background-color:${bg};color:${fg}" tabindex="0"><code>${html
    .split('\n')
    .map((line) => `<span class="line">${line || '\n'}</span>`)
    .join('\n')}</code></pre>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Preload highlighter immediately
getHighlighterInstance().catch(() => {
  /* fallback highlighter used on demand */
});
