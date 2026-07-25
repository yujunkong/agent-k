/**
 * PlanEditor - 계획 문서 편집 + Mermaid 실시간 렌더링 (C5-T05)
 * 
 * MD 편집 (textarea) + Mermaid.js 실시간 프리뷰
 * Cancel → draft 저장 (workspaceState)
 */
import React, { useState, useCallback } from 'react';
import type { PlanDocument } from './PlanGenerator';
import { MermaidDiagram } from '../chat/components/MermaidDiagram';

interface PlanEditorProps {
  document: PlanDocument;
  onSave: (content: string) => void;
  onCancel: () => void;
  readOnly?: boolean;
}

export function PlanEditor({ document, onSave, onCancel, readOnly }: PlanEditorProps) {
  const [content, setContent] = useState(document.content);
  const [mermaidBlocks, setMermaidBlocks] = useState<string[]>(() => extractMermaidBlocks(document.content));

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setMermaidBlocks(extractMermaidBlocks(newContent));
  }, []);

  const handleSave = () => {
    onSave(content);
  };

  return (
    <div className="plan-editor" style={{
      display: 'flex', flexDirection: 'column', height: '100%', gap: 8,
      padding: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 600 }}>
          📋 Plan: {document.title}
        </h3>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} className="settings-btn"
              style={{ padding: '4px 12px', fontSize: '0.85em' }}>
              Cancel
            </button>
            <button onClick={handleSave} className="settings-btn primary"
              style={{ padding: '4px 12px', fontSize: '0.85em', fontWeight: 600 }}>
              💾 Save Plan
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Editor pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '0.8em', opacity: 0.6, marginBottom: 4 }}>Markdown Editor</label>
          <textarea
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            readOnly={readOnly}
            style={{
              flex: 1, padding: 12, borderRadius: 6, resize: 'none',
              fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: '0.85em',
              lineHeight: 1.6,
              background: 'var(--vscode-editor-background, #1e1e1e)',
              color: 'var(--vscode-editor-foreground, #d4d4d4)',
              border: '1px solid var(--vscode-panel-border, #333)'
            }}
          />
        </div>

        {/* Preview pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '0.8em', opacity: 0.6, marginBottom: 4 }}>Preview</label>
          <div style={{
            flex: 1, padding: 12, borderRadius: 6, overflow: 'auto',
            background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.02))',
            border: '1px solid var(--vscode-panel-border, #333)'
          }}>
            {/* Render Mermaid blocks */}
            {mermaidBlocks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.9em' }}>Diagrams ({mermaidBlocks.length})</h4>
                {mermaidBlocks.map((block, i) => (
                  <div key={i} className="mermaid-preview" style={{
                    padding: 12, marginBottom: 8, borderRadius: 6,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px dashed var(--vscode-panel-border, #555)',
                    overflow: 'auto'
                  }}>
                    <MermaidDiagram definition={block} />
                  </div>
                ))}
              </div>
            )}

            {/* Render plain markdown preview (simplified) */}
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9em', lineHeight: 1.6 }}>
              {content.split('\n').slice(0, 100).map((line, i) => {
                if (line.startsWith('## ')) return <h4 key={i} style={{ margin: '12px 0 4px', fontSize: '1em' }}>{line.slice(3)}</h4>;
                if (line.startsWith('- [ ]')) return <div key={i} style={{ paddingLeft: 16, opacity: 0.8 }}>☐ {line.slice(6)}</div>;
                if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 16 }}>• {line.slice(2)}</div>;
                if (line.startsWith('```')) return null;
                if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
                return <div key={i}>{line}</div>;
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.75em', opacity: 0.4, textAlign: 'right' }}>
        {document.todoCount} steps | {document.sections.length} sections | slug: {document.slug}
      </div>
    </div>
  );
}

function extractMermaidBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}
