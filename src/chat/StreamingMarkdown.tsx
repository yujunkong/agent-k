import React, { useState, useEffect, useRef } from 'react';
import { CodeBlock } from './components/CodeBlock';
import { MermaidDiagram } from './components/MermaidDiagram';

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
          {node.type === 'text' && <span>{node.text}</span>}
          {node.type === 'heading' && (
            <HeadingTag level={node.level || 1}>
              {node.text}
              {isStreaming && !node.isComplete && (
                <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
              )}
            </HeadingTag>
          )}
          {node.type === 'list' && (
            <ul>
              {node.items?.map((item, i) => (
                <li key={i}>
                  {item}
                  {i === (node.items?.length || 1) - 1 && isStreaming && !node.isComplete && (
                    <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {node.type === 'blockquote' && (
            <blockquote>
              {node.text}
              {isStreaming && !node.isComplete && (
                <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />
              )}
            </blockquote>
          )}
          {node.type === 'table' && node.rows && (
            <table>
              {node.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.cells.map((cell, ci) => (
                    row.isHeader ? <th key={ci}>{cell}</th> : <td key={ci}>{cell}</td>
                  ))}
                </tr>
              ))}
            </table>
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
    // Only append new content
    const newContent = input.slice(this.processedLength);
    if (!newContent && this.processedLength > 0) return [...this.nodes];
    
    this.buffer += input;
    this.processedLength = input.length;
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
    this.buffer = '';
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
    const itemContent = line.replace(/^[*-]\s+/, '').trim();
    
    if (!this.currentNode.items) {
      this.currentNode.items = [];
    }
    
    if (newlineIdx >= 0) {
      this.currentNode.items.push(itemContent);
      const nextLine = remaining.slice(newlineIdx + 1).trimStart();
      
      if (nextLine.startsWith('- ') || nextLine.startsWith('* ')) {
        // Continue list with position at start of next line
        this.state = 'list';
        return i + newlineIdx + 1 + (remaining.slice(newlineIdx + 1).length - nextLine.length);
      }
      
      // End of list
      this.finalizeNode({
        id: nextId('list'),
        type: 'list',
        items: [...this.currentNode.items],
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + newlineIdx + 1;
    }
    
    // Streaming: last item might be incomplete
    this.currentNode.items.push(itemContent);
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

  private processTable(i: number, remaining: string): number {
    const newlineIdx = remaining.indexOf('\n');
    const line = newlineIdx >= 0 ? remaining.slice(0, newlineIdx) : remaining;
    const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
    
    // Detect header separator row
    if (cells.length > 0 && cells.every(c => /^[:\s-]+$/.test(c))) {
      if (newlineIdx >= 0) {
        return i + newlineIdx + 1;
      }
      return i + remaining.length;
    }
    
    if (!this.currentNode.rows) {
      this.currentNode.rows = [];
    }
    
    // Determine if header row (table just started, no rows yet)
    const isHeader = this.currentNode.rows.length === 0;
    this.currentNode.rows.push({ cells, isHeader });
    
    if (newlineIdx >= 0) {
      const nextLine = remaining.slice(newlineIdx + 1).trimStart();
      if (nextLine.includes('|')) {
        this.state = 'table';
        return i + newlineIdx + 1;
      }
      // End of table
      this.finalizeNode({
        id: nextId('table'),
        type: 'table',
        rows: [...this.currentNode.rows],
        isComplete: true
      });
      this.currentNode = {};
      this.state = 'text';
      return i + newlineIdx + 1;
    }
    
    return i + remaining.length;
  }

  private processText(i: number, remaining: string): number {
    // Check for fenced code block
    if (remaining.startsWith('```')) {
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
    if (remaining.startsWith('$$')) {
      this.state = 'math';
      return i + 2;
    }
    
    // Check for heading
    if (/^#{1,6}\s/.test(remaining)) {
      const level = remaining.match(/^(#{1,6})\s/)![1].length;
      this.currentNode = { type: 'heading', level, text: '' };
      this.state = 'heading';
      return i + level + 1;
    }
    
    // Check for list
    if (/^[*-]\s/.test(remaining)) {
      this.currentNode = { type: 'list', items: [] };
      this.state = 'list';
      return i;
    }
    
    // Check for blockquote
    if (remaining.startsWith('> ')) {
      this.currentNode = { type: 'blockquote', text: '' };
      this.state = 'blockquote';
      return i + 2;
    }
    
    // Check for table
    if (remaining.includes('|')) {
      this.state = 'table';
      this.currentNode = { type: 'table', rows: [] };
      return i;
    }
    
    // Regular text
    const newlineIdx = remaining.indexOf('\n');
    const lineEnd = newlineIdx >= 0 ? newlineIdx : remaining.length;
    const textSegment = remaining.slice(0, lineEnd);
    
    // Append to existing text node or create new
    const lastNode = this.nodes[this.nodes.length - 1];
    if (lastNode?.type === 'text' && lastNode.isComplete !== false) {
      // Append to existing text node
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
