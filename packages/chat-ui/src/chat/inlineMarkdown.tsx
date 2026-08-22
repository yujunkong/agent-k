/**
 * Lightweight inline markdown for labels / clarifying questions.
 * Supports **bold**, `code`, and simple newlines → <br>.
 */
import React from 'react';

export function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return text;
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    if (li > 0) out.push(<br key={`br-${li}`} />);
    out.push(<React.Fragment key={`ln-${li}`}>{renderInlineLine(line)}</React.Fragment>);
  });
  return out.length === 1 ? out[0] : out;
}

function renderInlineLine(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // **bold** | `code` | *italic*
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
