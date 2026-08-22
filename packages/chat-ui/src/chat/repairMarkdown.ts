/**
 * Repair markdown whose structural newlines were collapsed
 * (common with some local models / regenerate turns).
 *
 * Example jammed input:
 *   `| 원인 | 설명 ||---|---|| 로컬 모델 | … ---## 종합`
 * becomes proper GFM with newlines so StreamingMarkdown can parse tables/headings.
 *
 * IMPORTANT: do NOT rewrite every `||` into row breaks, and do NOT treat normal
 * `## Heading` as jammed — those false positives split option tables into
 * orphan "A" / "B" rows.
 */
export function repairCollapsedMarkdown(input: string): string {
  if (!input) return input;

  let s = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // If the model dumped JSON-escaped newlines, expand before jam detection
  const literalNl = (s.match(/\\n/g) || []).length;
  const realNl = (s.match(/\n/g) || []).length;
  if (literalNl >= 2 && literalNl > realNl) {
    s = s
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
  }
  // Always: `| A || desc | … |` → `| A | desc | … |` (option letter + empty cell)
  // Letters must be uppercase so we don't merge `| x || B |` in collapsed tables.
  s = s.replace(
    /\|(\s*(?:\*\*)?(?:[A-Z]|[0-9]{1,2}|[①-⑩])(?:\*\*)?\.?\s*)\|\|/g,
    '|$1| '
  );

  const pipeJams = (s.match(/\|\|/g) || []).length;
  const newlines = (s.match(/\n/g) || []).length;
  // Prose glued to heading: "다## 다음" — NOT normal "\n## 다음" or "## 다음"
  const jammedHeading =
    /---\s*#{1,6}\s/.test(s) || /(?:^|[^\n#])[^\n#\s]#{1,6}\s/.test(s);
  // Truly one-line / few-line collapsed tables only
  const collapsedTable =
    s.includes('|') &&
    /\|[\s:-]*---/.test(s) &&
    (newlines < 3 || (pipeJams > 0 && pipeJams >= Math.max(2, newlines)));

  if (!collapsedTable && !jammedHeading) {
    return s.replace(/\n{3,}/g, '\n\n');
  }

  // ---## Heading → ---\n\n## Heading
  s = s.replace(/(---)\s*(#{1,6}\s)/g, '$1\n\n$2');

  // Prose jammed into ATX heading: text## → text\n\n## (require non-# before)
  s = s.replace(/([^\n#])(#{1,6}\s)/g, '$1\n\n$2');

  if (collapsedTable) {
    // `| 설명 ||---|---|` → `| 설명 |\n|---|---|`
    s = s.replace(/\|\|/g, '|\n|');
    // Prose immediately followed by a table (not already a table line)
    s = s.replace(/([^\n|])(\|(?:[^|\n]+\|){2,})/g, '$1\n\n$2');
  }

  // Trailing `|---` glued before a heading
  s = s.replace(/\|\s*---\s*\n+(?=#{1,6}\s)/g, '\n\n');

  // Numbered lists jammed onto previous text
  s = s.replace(/([^\n])(\d+\.\s+)/g, '$1\n$2');

  return s.replace(/\n{3,}/g, '\n\n');
}
