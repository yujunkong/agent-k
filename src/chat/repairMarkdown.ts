/**
 * Repair markdown whose structural newlines were collapsed
 * (common with some local models / regenerate turns).
 *
 * Example jammed input:
 *   `| 원인 | 설명 ||---|---|| 로컬 모델 | … ---## 종합`
 * becomes proper GFM with newlines so StreamingMarkdown can parse tables/headings.
 */
export function repairCollapsedMarkdown(input: string): string {
  if (!input) return input;

  let s = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const pipeJams = (s.match(/\|\|/g) || []).length;
  const newlines = (s.match(/\n/g) || []).length;
  const jammedHeading = /---\s*#{1,6}\s/.test(s) || /[^\n]#{1,6}\s/.test(s);
  const jammedTable =
    pipeJams >= 1 ||
    (s.includes('|') && /\|---/.test(s) && newlines < 3);

  if (!jammedTable && !jammedHeading) {
    return s;
  }

  // ---## Heading → ---\n\n## Heading (also `|---##` → `|---\n\n##`)
  s = s.replace(/(---)\s*(#{1,6}\s)/g, '$1\n\n$2');

  // Prose jammed into ATX heading: text## → text\n\n##
  s = s.replace(/([^\n#])(#{1,6}\s)/g, '$1\n\n$2');

  // Primary table fix: row boundaries collapse to `||`
  // `| 설명 ||---|---|` → `| 설명 |\n|---|---|`
  // `|---|| 셀` → `|---|\n| 셀`
  // Do NOT split inside `|---|---|` (single pipes only).
  s = s.replace(/\|\|/g, '|\n|');

  // Prose immediately followed by a table (letter/punct then `| col |`)
  s = s.replace(/([^\n|])(\|(?:[^|\n]+\|){2,})/g, '$1\n\n$2');

  // Trailing `|---` glued before a heading (from `... |---##`)
  s = s.replace(/\|\s*---\s*\n+(?=#{1,6}\s)/g, '\n\n');

  // Numbered lists jammed onto previous text
  s = s.replace(/([^\n])(\d+\.\s+)/g, '$1\n$2');

  return s.replace(/\n{3,}/g, '\n\n');
}
