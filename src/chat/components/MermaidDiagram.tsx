/**
 * Mermaid diagram renderer with sanitization for common LLM syntax mistakes.
 */
import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import {
  aggressiveQuoteMermaid,
  sanitizeMermaid
} from '../mermaidSanitize';

export { aggressiveQuoteMermaid, sanitizeMermaid } from '../mermaidSanitize';

let initialized = false;
function initMermaid() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    theme: 'dark',
    securityLevel: 'loose',
    startOnLoad: false,
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 16
    },
    themeVariables: {
      darkMode: true,
      background: '#1e1e1e',
      primaryColor: '#3b4252',
      primaryTextColor: '#eceff4',
      primaryBorderColor: '#81a1c1',
      secondaryColor: '#434c5e',
      secondaryTextColor: '#eceff4',
      tertiaryColor: '#2e3440',
      tertiaryTextColor: '#d8dee9',
      lineColor: '#88c0d0',
      textColor: '#eceff4',
      mainBkg: '#3b4252',
      nodeBorder: '#81a1c1',
      clusterBkg: '#2e3440',
      clusterBorder: '#4c566a',
      titleColor: '#eceff4',
      edgeLabelBackground: '#2e3440',
      arrowheadColor: '#88c0d0'
    },
    // Edge paths: stroke-only + high-contrast color on dark chat background
    themeCSS: [
      '.edgePath .path, .edgePath path, .flowchart-link, .edgePaths .path { fill: none !important; stroke: #88c0d0 !important; stroke-width: 1.5px !important; }',
      '.marker, marker path, .arrowheadPath { fill: #88c0d0 !important; stroke: #88c0d0 !important; }',
      '.cluster rect { fill: #2e3440 !important; stroke: #4c566a !important; }'
    ].join('\n')
  });
}

function shortMermaidError(err: string): string {
  // Drop the huge "Expecting 'SQE', 'DOUBLECIRCLEEND', ..." token dump
  const m = err.match(/^Parse error on line \d+:[^\n]*/i);
  if (m) return `${m[0].slice(0, 120)}… (labels with ( ) / need quotes)`;
  if (err.length > 160) return `${err.slice(0, 140)}…`;
  return err;
}

interface MermaidDiagramProps {
  definition: string;
  streaming?: boolean;
}

export function MermaidDiagram({ definition, streaming }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    initMermaid();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (streaming && definition.trim().length < 10) return;

    debounceRef.current = setTimeout(async () => {
      const cleaned = sanitizeMermaid(definition);
      try {
        const id = idRef.current;
        const { svg: rendered } = await mermaid.render(id, cleaned);
        setSvg(rendered);
        setError(null);
      } catch (e) {
        try {
          const aggressive = aggressiveQuoteMermaid(cleaned);
          const { svg: rendered } = await mermaid.render(
            `${idRef.current}_r`,
            aggressive
          );
          setSvg(rendered);
          setError(null);
        } catch (e2) {
          setError(
            e2 instanceof Error
              ? e2.message
              : e instanceof Error
                ? e.message
                : 'Render failed'
          );
          setSvg('');
        }
      }
    }, streaming ? 200 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [definition, streaming]);

  if (error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-msg">
          Diagram error: {shortMermaidError(error)}
        </div>
        <button
          type="button"
          className="mermaid-error-toggle"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? 'Hide source' : 'Show source'}
        </button>
        {showSource ? (
          <pre className="mermaid-fallback">{sanitizeMermaid(definition)}</pre>
        ) : null}
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
