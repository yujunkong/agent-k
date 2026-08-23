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

/**
 * Extract token HTML inside `<span class="line">…</span>`.
 * Comment: naive /<\/span>/ truncates at the first nested token close
 * (markdown `- foo` → only `-`), which broke FileEditCard (CONV-019).
 */
export function extractLineInnerHtml(preHtml: string): string {
  if (!preHtml) return '';
  const open = preHtml.match(/<span class="line">/);
  if (open && open.index != null) {
    const start = open.index + open[0].length;
    let depth = 1;
    let i = start;
    while (i < preHtml.length && depth > 0) {
      const nextOpen = preHtml.indexOf('<span', i);
      const nextClose = preHtml.indexOf('</span>', i);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 5;
      } else {
        depth--;
        if (depth === 0) return preHtml.slice(start, nextClose);
        i = nextClose + 7;
      }
    }
  }
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
