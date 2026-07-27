/**
 * Highlight a single source line → inner HTML (spans with colors).
 * Used by FileEditCard / inline code regions.
 */
import { highlightCode, normalizeLang } from './highlighter';

function isDarkTheme(): boolean {
  try {
    return (
      document.body.classList.contains('vscode-dark') ||
      document.body.classList.contains('vscode-high-contrast') ||
      !document.body.classList.contains('vscode-light')
    );
  } catch {
    return true;
  }
}

/** Extract token HTML from a full Shiki/fallback <pre> document */
export function extractLineInnerHtml(preHtml: string): string {
  if (!preHtml) return '';
  const lineMatch = preHtml.match(/<span class="line">([\s\S]*?)<\/span>/);
  if (lineMatch) return lineMatch[1] || '';
  const codeMatch = preHtml.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (codeMatch) {
    return codeMatch[1]
      .replace(/<\/?span class="line">/g, '')
      .replace(/\n$/, '');
  }
  return preHtml;
}

export async function highlightLineHtml(
  line: string,
  lang: string,
  isDark = isDarkTheme()
): Promise<string> {
  // Empty / whitespace-only — keep as text
  if (!line) return '';
  const html = await highlightCode(line, normalizeLang(lang), isDark);
  return extractLineInnerHtml(html) || escapeText(line);
}

function escapeText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { isDarkTheme };
