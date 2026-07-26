import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid once
let initialized = false;
function initMermaid() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    theme: 'base',
    securityLevel: 'loose',
    startOnLoad: false,
    themeVariables: {
      background: '#1e1e2e',
      primaryColor: '#6366f1',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#6366f1',
      lineColor: '#64748b',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a'
    }
  });
}

interface MermaidDiagramProps {
  definition: string;
  streaming?: boolean;
}

export function MermaidDiagram({ definition, streaming }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    initMermaid();
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Don't render incomplete definitions while streaming
    if (streaming && definition.trim().length < 10) return;

    debounceRef.current = setTimeout(async () => {
      try {
        const id = idRef.current;
        const { svg: rendered } = await mermaid.render(id, definition);
        setSvg(rendered);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Render failed');
        setSvg('');
      }
    }, streaming ? 150 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [definition, streaming]);

  if (error) {
    return (
      <div className="mermaid-error">
        <pre className="mermaid-fallback">{definition}</pre>
        <span className="mermaid-error-msg">Diagram error: {error}</span>
      </div>
    );
  }

  if (!svg) {
    return (
      <div ref={containerRef} className="mermaid-diagram mermaid-diagram--loading">
        <pre className="mermaid-loading">{definition}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
