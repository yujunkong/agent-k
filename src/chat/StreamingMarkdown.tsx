import React, { useState, useEffect, useRef } from 'react';

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
}

interface ParsedNode {
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
      {isStreaming && <span dangerouslySetInnerHTML={{ __html: STREAMING_CURSOR }} />}
    </div>
  );
}

class MarkdownParser {
  private state: 'text' | 'code' | 'math' | 'mermaid' = 'text';
  private buffer = '';
  private nodes: ParsedNode[] = [];
  private currentNode: Partial<ParsedNode> = {};
  private codeLang = '';
  private codeContent = '';
  private inMath = false;
  private mathBuffer = '';
  private streaming = false;

  setStreaming(value: boolean) {
    this.streaming = value;
  }

  feed(input: string): ParsedNode[] {
    this.buffer += input;
    this.process();
    return [...this.nodes];
  }

  private process() {
    let i = 0;
    while (i < this.buffer.length) {
      const char = this.buffer[i];

      if (this.state === 'code') {
        if (this.buffer.slice(i).startsWith('```')) {
          this.currentNode = {
            id: `code-${Date.now()}-${Math.random()}`,
            type: 'code',
            lang: this.codeLang,
            code: this.codeContent,
            isComplete: true
          };
          this.nodes.push(this.currentNode as ParsedNode);
          this.currentNode = {};
          this.codeLang = '';
          this.codeContent = '';
          this.state = 'text';
          i += 3;
        } else {
          this.codeContent += char;
          i++;
        }
      } else if (this.state === 'math') {
        if (this.buffer.slice(i).startsWith('$$')) {
          this.currentNode = {
            id: `math-${Date.now()}-${Math.random()}`,
            type: 'math',
            formula: this.mathBuffer,
            isComplete: true
          };
          this.nodes.push(this.currentNode as ParsedNode);
          this.currentNode = {};
          this.mathBuffer = '';
          this.state = 'text';
          i += 2;
        } else {
          this.mathBuffer += char;
          i++;
        }
      } else if (this.state === 'mermaid') {
        if (this.buffer.slice(i).startsWith('```')) {
          this.currentNode = {
            id: `mermaid-${Date.now()}-${Math.random()}`,
            type: 'mermaid',
            definition: this.currentNode.definition || '',
            isComplete: true
          };
          this.nodes.push(this.currentNode as ParsedNode);
          this.currentNode = {};
          this.state = 'text';
          i += 3;
        } else {
          this.currentNode.definition = (this.currentNode.definition || '') + char;
          i++;
        }
      } else {
        // Check for code block start
        if (this.buffer.slice(i).startsWith('```')) {
          const langMatch = this.buffer.slice(i + 3).match(/^(\w+)/);
          this.codeLang = langMatch ? langMatch[1] : '';
          if (this.codeLang === 'mermaid') {
            this.state = 'mermaid';
            this.currentNode = { type: 'mermaid', definition: '' };
          } else {
            this.state = 'code';
          }
          i += 3 + this.codeLang.length;
        }
        // Check for math block
        else if (this.buffer.slice(i).startsWith('$$')) {
          this.state = 'math';
          i += 2;
        }
        // Regular text
        else {
          if (!this.currentNode.text) {
            this.currentNode = {
              id: `text-${Date.now()}-${Math.random()}`,
              type: 'text',
              text: '',
              isComplete: !this.streaming
            };
            this.nodes.push(this.currentNode as ParsedNode);
          }
          this.currentNode.text += char;
          i++;
        }
      }
    }
    this.buffer = this.buffer.slice(i);
  }
}

function CodeBlock({ language, code, streaming }: { language: string; code: string; streaming: boolean }) {
  return (
    <pre className={`code-block ${language}`}>
      <code className={`language-${language}`}>
        {code}
        {streaming && <span className="streaming-cursor">█</span>}
      </code>
      {language && <span className="code-lang">{language}</span>}
    </pre>
  );
}

function MathFormula({ formula }: { formula: string }) {
  return <span className="math-formula">${formula}$</span>;
}

function MermaidDiagram({ definition }: { definition: string }) {
  return <div className="mermaid">{definition}</div>;
}