import { createHighlighter, createJavaScriptRegexEngine, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let loadPromise: Promise<Highlighter> | null = null;

const SUPPORTED_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx', 'python', 'rust', 'go',
  'java', 'kotlin', 'swift', 'ruby', 'php', 'c', 'cpp', 'csharp',
  'html', 'css', 'scss', 'json', 'yaml', 'markdown', 'bash', 'shell',
  'sql', 'graphql', 'diff', 'dockerfile', 'toml', 'xml', 'plaintext'
] as const;

export function getSupportedLanguages(): string[] {
  return [...SUPPORTED_LANGS];
}

export async function getHighlighterInstance(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (loadPromise) return loadPromise;

  loadPromise = createHighlighter({
    langs: SUPPORTED_LANGS as any,
    // Cursor-like token colors (richer than dark-plus mono look)
    themes: ['github-dark', 'github-light'],
    engine: createJavaScriptRegexEngine()
  }).then((hl) => {
    highlighter = hl;
    return hl;
  });

  return loadPromise;
}

export function highlightCode(code: string, lang: string, isDark: boolean): Promise<string> {
  return getHighlighterInstance().then((hl) => {
    try {
      const normalizedLang = lang.toLowerCase();
      // Check if language is supported
      const langExists = hl.getLoadedLanguages().includes(normalizedLang as any);
      if (!langExists) {
        // Return escaped code for unsupported languages
        return escapeHtml(code);
      }
      return hl.codeToHtml(code, {
        lang: normalizedLang,
        theme: isDark ? 'github-dark' : 'github-light'
      });
    } catch {
      return escapeHtml(code);
    }
  });
}

export function isHighlighterReady(): boolean {
  return highlighter !== null;
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
getHighlighterInstance();
