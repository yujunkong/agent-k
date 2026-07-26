import React, { useState, useEffect, useRef } from 'react';
import { CodeBlock } from './components/CodeBlock';
import { MermaidDiagram } from './components/MermaidDiagram';
import { repairCollapsedMarkdown } from './repairMarkdown';

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
}

export interface ParsedNode {
  id: string;
  type: 'text' | 'code' | 'math' | 'mermaid' | 'heading' | 'list' | 'blockquote' | 'table';
  text?: string;
  lang?: string;
  code?: string;
  formula?: string;
  definition?: string;
  level?: number;
  items?: string[];
  /** true → <ol>, false/undefined → <ul> */
  ordered?: boolean;
  isComplete?: boolean;
  rows?: TableRow[];
}

interface TableRow {
  cells: string[];
  isHeader?: boolean;
}

let nodeCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${++nodeCounter}`;
}

const STREAMING_CURSOR = '<span class="streaming-cursor">█</span>';

export function StreamingMarkdown({ content, isStreaming }: StreamingMarkdownProps) {
  const [nodes, setNodes] = useState<ParsedNode[]>([]);
  const parserRef = useRef<MarkdownParser>(new MarkdownParser());

  useEffect(() => {
    parserRef.current.setStreaming(isStreaming);
    const newNodes = parserRef.current.feed(content);
    setNodes(newNodes);
  }, [content, isStreaming]);

  return (
    <div className="markdown-body">
      {nodes.map((node) => (
        <React.Fragment key={node.id}>
          {node.type === 'text' && (node.text || '').trim() !== '' && (
            <div className="md-text">{renderInline(node.text || '')}</div>
          )}
          {node.type === 'heading' && (
            <HeadingTag level={node.level || 1}>
              {renderInline(node.text || '')}
              {isStreaming && !node.isComplete && (
                <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
              )}
            </HeadingTag>
          )}
          {node.type === 'list' && (
            node.ordered ? (
              <ol>
                {node.items?.map((item, i) => (
                  <li key={i}>
                    {renderInline(item)}
                    {i === (node.items?.length || 1) - 1 && isStreaming && !node.isComplete && (
                      <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <ul>
                {node.items?.map((item, i) => (
                  <li key={i}>
                    {renderInline(item)}
                    {i === (node.items?.length || 1) - 1 && isStreaming && !node.isComplete && (
                      <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
          {node.type === 'blockquote' && (
            <blockquote>
              {renderInline(node.text || '')}
              {isStreaming && !node.isComplete && (
                <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
              )}
            </blockquote>
          )}
          {node.type === 'table' && node.rows && (
            <div className="md-table-wrap">
              <table>
                {node.rows.some((r) => r.isHeader) ? (
                  <thead>
                    {node.rows
                      .filter((r) => r.isHeader)
                      .map((row, ri) => (
                        <tr key={`h-${ri}`}>
                          {row.cells.map((cell, ci) => (
                            <th key={ci}>{renderInline(cell || '\u00a0')}</th>
                          ))}
                        </tr>
                      ))}
                  </thead>
                ) : null}
                <tbody>
                  {node.rows
                    .filter((r) => !r.isHeader)
                    .map((row, ri) => (
                      <tr key={`b-${ri}`}>
                        {row.cells.map((cell, ci) => (
                          <td key={ci}>{renderInline(cell || '\u00a0')}</td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {node.type === 'code' && (
            <CodeBlock
              language={node.lang || ''}
              code={node.code || ''}
              streaming={isStreaming && !node.isComplete}
            />
          )}
          {node.type === 'math' && <MathFormula formula={node.formula || ''} />}
          {node.type === 'mermaid' && <MermaidDiagram definition={node.definition || ''} />}
        </React.Fragment>
      ))}
      {isStreaming && nodes.length > 0 && nodes[nodes.length - 1].isComplete !== false && (
        <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
      )}
    </div>
  );
}

function HeadingTag({ level, children }: { level: number; children: React.ReactNode }) {
  const Tag = `h${Math.min(Math.max(level, 1), 6)}` as keyof JSX.IntrinsicElements;
  return <Tag>{children}</Tag>;
}

/** Minimal inline markdown: **bold**, `code` */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

class MarkdownParser {
  private state: 'text' | 'code' | 'math' | 'mermaid' | 'heading' | 'list' | 'blockquote' | 'table' = 'text';
  private buffer = '';
  private nodes: ParsedNode[] = [];
  private currentNode: Partial<ParsedNode> = {};
  private codeLang = '';
  private codeContent = '';
  private mathBuffer = '';
  private streaming = false;
  private processedLength = 0;

  setStreaming(value: boolean) {
    this.streaming = value;
  }

  feed(input: string): ParsedNode[] {
    // Full reparse each time — incremental append was splitting every streamed
    // chunk into its own block (vertical 1-token columns) because
    // `isComplete === false` prevented merging text nodes, and list mode
    // pushed a new item per chunk.
    this.processedLength = 0;
    this.buffer = '';
    this.nodes = [];
    this.currentNode = {};
    this.state = 'text';
    this.codeLang = '';
    this.codeContent = '';
    this.mathBuffer = '';

    if (!input) return [];

    this.buffer = repairCollapsedMarkdown(input);
    this.processedLength = this.buffer.length;
    this.process();
    return [...this.nodes];
  }

  private process() {
    let i = 0;
    while (i < this.buffer.length) {
      const remaining = this.buffer.slice(i);

      switch (this.state) {
        case 'code':
          i = this.processCode(i, remaining);
          break;
        case 'math':
          i = this.processMath(i, remaining);
          break;
        case 'mermaid':
          i = this.processMermaid(i, remaining);
          break;
        case 'heading':
          i = this.processHeading(i, remaining);
          break;
        case 'list':
          i = this.processList(i, remaining);
          break;
        case 'blockquote':
          i = this.processBlockquote(i, remaining);
          break;
        case 'table':
          i = this.processTable(i, remaining);
          break;
        default:
          i = this.processText(i, remaining);
          break;
      }
    }
    this.flushIncompleteBlocks();
    this.buffer = '';
  }

  /** Push in-progress table/code/heading so streaming (and truncated ends) still render. */
  private flushIncompleteBlocks() {
    if (this.state === 'table' && this.currentNode.rows && this.currentNode.rows.length > 0) {
      this.nodes.push({
        id: nextId('table'),
        type: 'table',
        rows: coalesceTableRows(this.currentNode.rows),
        isComplete: !this.streaming
      });
      return;
    }
    if (this.state === 'code' && (this.codeContent || this.codeLang)) {
      this.nodes.push({
        id: nextId('code'),
        type: 'code',
        lang: this.codeLang,
        code: this.codeContent,
        isComplete: !this.streaming
      });
      return;
    }
    if (this.state === 'heading' && (this.currentNode.text != null || this.currentNode.level)) {
      this.nodes.push({
        id: nextId('heading'),
        type: 'heading',
        level: this.currentNode.level || 1,
        text: this.currentNode.text || '',
        isComplete: !this.streaming
      });
    }
  }

  private processTable(i: number, remaining: string): number {
    const newlineIdx = remaining.indexOf('\n');
    const line = newlineIdx >= 0 ? remaining.slice(0, newlineIdx) : remaining;
    const cells = splitTableCells(line);

    // Detect header separator row (|---|---|)
    if (
      cells.length > 0 &&
      cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')) || /^[:\s-]+$/.test(c))
    ) {
      if (newlineIdx >= 0) {
        return i + newlineIdx + 1;
      }
      return i + remaining.length;
    }

    if (!this.currentNode.rows) {
      this.currentNode.rows = [];
    }

    if (cells.length > 0) {
      const isHeader = this.currentNode.rows.length === 0;
      this.currentNode.rows.push({ cells, isHeader });
    }

    if (newlineIdx >= 0) {
      const nextLine = remaining.slice(newlineIdx + 1);
      const nextTrim = nextLine.trimStart();
      if (nextTrim.startsWith('|') || /^\s*\|/.test(nextLine)) {
        this.state = 'table';
        return i + newlineIdx + 1;
      }
      // End of table
      this.finalizeNode({
        id: nextId('table'),
        type: 'table',
        rows: coalesceTableRows(this.currentNode.rows),
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + newlineIdx + 1;
    }

    // Incomplete last line — kept in currentNode; flushIncompleteBlocks shows it
    return i + remaining.length;
  }

  private processCode(i: number, remaining: string): number {
    if (remaining.startsWith('```')) {
      this.finalizeNode({
        id: nextId('code'),
        type: 'code',
        lang: this.codeLang,
        code: this.codeContent,
        isComplete: true
      });
      this.codeLang = '';
      this.codeContent = '';
      this.state = 'text';
      return i + 3;
    }
    this.codeContent += remaining[0];
    return i + 1;
  }

  private processMath(i: number, remaining: string): number {
    if (remaining.startsWith('$$')) {
      this.finalizeNode({
        id: nextId('math'),
        type: 'math',
        formula: this.mathBuffer,
        isComplete: true
      });
      this.mathBuffer = '';
      this.state = 'text';
      return i + 2;
    }
    this.mathBuffer += remaining[0];
    return i + 1;
  }

  private processMermaid(i: number, remaining: string): number {
    if (remaining.startsWith('```')) {
      this.finalizeNode({
        ...this.currentNode,
        id: nextId('mermaid'),
        type: 'mermaid',
        definition: this.currentNode.definition || '',
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + 3;
    }
    this.currentNode.definition = (this.currentNode.definition || '') + remaining[0];
    return i + 1;
  }

  private processHeading(i: number, remaining: string): number {
    const newlineIdx = remaining.indexOf('\n');
    const line = newlineIdx >= 0 ? remaining.slice(0, newlineIdx) : remaining;
    const content = line.trimStart().replace(/^#{1,6}\s+/, '');
    
    if (newlineIdx >= 0) {
      // Complete heading
      this.finalizeNode({
        id: nextId('heading'),
        type: 'heading',
        level: this.currentNode.level || 1,
        text: content,
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + newlineIdx + 1;
    }
    // Still in heading, update text
    this.currentNode.text = content;
    return i + remaining.length;
  }

  private processList(i: number, remaining: string): number {
    const newlineIdx = remaining.indexOf('\n');
    const line = newlineIdx >= 0 ? remaining.slice(0, newlineIdx) : remaining;
    const ordered = this.currentNode.ordered === true;
    const itemContent = ordered
      ? line.replace(/^\d+\.\s+/, '').trim()
      : line.replace(/^[*-]\s+/, '').trim();

    if (!this.currentNode.items) {
      this.currentNode.items = [];
    }

    if (newlineIdx >= 0) {
      this.currentNode.items.push(itemContent);
      const nextLine = remaining.slice(newlineIdx + 1).trimStart();
      const cont = ordered
        ? /^\d+\.\s/.test(nextLine)
        : nextLine.startsWith('- ') || nextLine.startsWith('* ');

      if (cont) {
        this.state = 'list';
        return i + newlineIdx + 1 + (remaining.slice(newlineIdx + 1).length - nextLine.length);
      }

      this.finalizeNode({
        id: nextId('list'),
        type: 'list',
        ordered,
        items: [...this.currentNode.items],
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + newlineIdx + 1;
    }

    // Incomplete line while streaming — hold as single in-progress item
    if (this.currentNode.items.length === 0) {
      this.currentNode.items.push(itemContent);
    } else {
      this.currentNode.items[this.currentNode.items.length - 1] = itemContent;
    }
    // Keep a live list node visible
    const liveIdx = this.nodes.findIndex(
      (n) => n.type === 'list' && n.isComplete === false
    );
    const liveNode: ParsedNode = {
      id: liveIdx >= 0 ? this.nodes[liveIdx].id : nextId('list'),
      type: 'list',
      ordered,
      items: [...this.currentNode.items],
      isComplete: false
    };
    if (liveIdx >= 0) this.nodes[liveIdx] = liveNode;
    else this.nodes.push(liveNode);
    return i + remaining.length;
  }

  private processBlockquote(i: number, remaining: string): number {
    const newlineIdx = remaining.indexOf('\n');
    const line = newlineIdx >= 0 ? remaining.slice(0, newlineIdx) : remaining;
    const content = line.replace(/^>\s?/, '');
    
    if (newlineIdx >= 0) {
      this.finalizeNode({
        id: nextId('blockquote'),
        type: 'blockquote',
        text: (this.currentNode.text || '') + content,
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + newlineIdx + 1;
    }
    this.currentNode.text = (this.currentNode.text || '') + content;
    return i + remaining.length;
  }

  private processText(i: number, remaining: string): number {
    // Fenced code only at line start (avoid mid-prose ``` breaking the bubble)
    const atLineStart = i === 0 || this.buffer[i - 1] === '\n';
    if (atLineStart && remaining.startsWith('```')) {
      const after = remaining.slice(3);
      const langMatch = after.match(/^(\w+)/);
      this.codeLang = langMatch ? langMatch[1] : '';
      if (this.codeLang === 'mermaid') {
        this.currentNode = { type: 'mermaid', definition: '' };
        this.state = 'mermaid';
      } else {
        this.state = 'code';
      }
      return i + 3 + (this.codeLang ? this.codeLang.length : 0);
    }
    
    // Check for math block
    if (atLineStart && remaining.startsWith('$$')) {
      this.state = 'math';
      return i + 2;
    }
    
    // Check for heading
    if (atLineStart && /^#{1,6}\s/.test(remaining)) {
      const level = remaining.match(/^(#{1,6})\s/)![1].length;
      this.currentNode = { type: 'heading', level, text: '' };
      this.state = 'heading';
      return i + level + 1;
    }
    
    // Check for unordered / ordered list
    if (atLineStart && /^[*-]\s/.test(remaining)) {
      this.currentNode = { type: 'list', items: [], ordered: false };
      this.state = 'list';
      return i;
    }
    if (atLineStart && /^\d+\.\s/.test(remaining)) {
      this.currentNode = { type: 'list', items: [], ordered: true };
      this.state = 'list';
      return i;
    }

    // Check for blockquote
    if (atLineStart && remaining.startsWith('> ')) {
      this.currentNode = { type: 'blockquote', text: '' };
      this.state = 'blockquote';
      return i + 2;
    }

    // GFM table: line must start with |
    if (atLineStart && /^\s*\|.+\|/.test(remaining)) {
      this.state = 'table';
      this.currentNode = { type: 'table', rows: [] };
      return i;
    }

    // Regular text — always merge into the previous text node
    const newlineIdx = remaining.indexOf('\n');
    const lineEnd = newlineIdx >= 0 ? newlineIdx : remaining.length;
    const textSegment = remaining.slice(0, lineEnd);

    const lastNode = this.nodes[this.nodes.length - 1];
    if (lastNode?.type === 'text') {
      lastNode.text = (lastNode.text || '') + textSegment + (newlineIdx >= 0 ? '\n' : '');
      lastNode.isComplete = !this.streaming;
    } else {
      this.finalizeNode({
        id: nextId('text'),
        type: 'text',
        text: textSegment + (newlineIdx >= 0 ? '\n' : ''),
        isComplete: !this.streaming
      });
    }

    if (newlineIdx >= 0) {
      return i + newlineIdx + 1;
    }
    return i + remaining.length;
  }

  private finalizeNode(node: ParsedNode) {
    this.nodes.push(node);
    this.currentNode = {};
  }
}

function MathFormula({ formula }: { formula: string }) {
  return <span className="math-formula">${formula}$</span>;
}

/** Preserve empty cells — `.filter(trim)` breaks GFM column alignment */
function splitTableCells(line: string): string[] {
  let s = line.trim();
  if (!s) return [];
  // Lone "|" / "||" noise rows from broken repairs
  if (/^\|+$/.test(s.replace(/\s/g, ''))) return [];
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function normalizeTableRows(rows: TableRow[]): TableRow[] {
  const cols = Math.max(1, ...rows.map((r) => r.cells.length));
  return rows.map((r) => ({
    ...r,
    cells: Array.from({ length: cols }, (_, i) => r.cells[i] ?? '')
  }));
}

/**
 * Merge orphan label rows ("A", "B.", "**C**") into the following content row.
 * Happens when models write `| A || desc | pros |` and repair/split breaks it.
 */
function coalesceTableRows(rows: TableRow[]): TableRow[] {
  const cleaned = rows.filter((r) => r.cells.some((c) => c.trim()));
  const out: TableRow[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const row = cleaned[i];
    if (row.isHeader) {
      out.push(row);
      continue;
    }

    const nonEmptyIdx = row.cells
      .map((c, idx) => ({ c: c.trim(), idx }))
      .filter((x) => x.c);
    const labelOnly =
      nonEmptyIdx.length === 1 &&
      isOptionLabel(nonEmptyIdx[0].c) &&
      i + 1 < cleaned.length &&
      !cleaned[i + 1].isHeader;

    if (labelOnly) {
      const label = stripMdEmphasis(nonEmptyIdx[0].c).replace(/\.$/, '');
      const next = cleaned[i + 1];
      const merged = [...next.cells];
      const first = (merged[0] || '').trim();
      if (!first || !new RegExp(`^${escapeRegExp(label)}\\.?\\b`).test(first)) {
        merged[0] = first ? `${label}. ${first}` : `${label}.`;
      }
      out.push({ cells: merged, isHeader: false });
      i++;
      continue;
    }

    out.push(row);
  }

  return normalizeTableRows(out);
}

function isOptionLabel(cell: string): boolean {
  const t = stripMdEmphasis(cell).trim();
  // A / B. / 1 / ① — short option markers only (uppercase letters)
  return /^(?:[A-Z]|[0-9]{1,2}|[①-⑩])\.?$/.test(t);
}

function stripMdEmphasis(s: string): string {
  return s.replace(/\*\*/g, '').replace(/__/g, '').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
