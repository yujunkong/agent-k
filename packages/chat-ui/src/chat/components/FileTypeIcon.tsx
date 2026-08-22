/**
 * Compact file-type icons for @ mention palette (Cursor / VS Code vibe).
 */
import React from 'react';

type Props = {
  path: string;
  kind?: 'file' | 'folder';
  size?: number;
  className?: string;
};

function extOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i + 1).toLowerCase();
}

type Spec = { label: string; bg: string; fg?: string };

function specFor(ext: string, kind: 'file' | 'folder'): Spec {
  if (kind === 'folder') return { label: '', bg: '#dcb67a' };
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return { label: 'RX', bg: '#61dafb', fg: '#0b1e2a' };
    case 'ts':
      return { label: 'TS', bg: '#3178c6' };
    case 'js':
    case 'mjs':
    case 'cjs':
      return { label: 'JS', bg: '#f7df1e', fg: '#1a1a1a' };
    case 'json':
      return { label: '{}', bg: '#cbcb41', fg: '#1a1a1a' };
    case 'md':
    case 'mdx':
      return { label: 'MD', bg: '#519aba' };
    case 'css':
      return { label: 'CSS', bg: '#563d7c' };
    case 'scss':
    case 'sass':
      return { label: 'SC', bg: '#c6538c' };
    case 'html':
      return { label: 'HTML', bg: '#e34c26' };
    case 'svg':
      return { label: 'SVG', bg: '#ffb13b', fg: '#1a1a1a' };
    case 'rs':
      return { label: 'RS', bg: '#dea584', fg: '#1a1a1a' };
    case 'py':
      return { label: 'PY', bg: '#3572a5' };
    case 'go':
      return { label: 'GO', bg: '#00add8', fg: '#0b1e2a' };
    case 'yml':
    case 'yaml':
      return { label: 'YML', bg: '#cb171e' };
    case 'toml':
      return { label: 'TM', bg: '#9c4221' };
    case 'sh':
    case 'bash':
    case 'zsh':
      return { label: 'SH', bg: '#89e051', fg: '#1a1a1a' };
    case 'sql':
      return { label: 'SQL', bg: '#e38c00' };
    case 'vue':
      return { label: 'VUE', bg: '#41b883', fg: '#0b1e2a' };
    case 'svelte':
      return { label: 'SV', bg: '#ff3e00' };
    default:
      return { label: ext ? ext.slice(0, 3).toUpperCase() : '·', bg: '#6e7681' };
  }
}

function FolderGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.586a1.5 1.5 0 0 1 1.06.44L8.5 3.5H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3.5z" />
    </svg>
  );
}

/** React/TSX atom mark */
function ReactGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="2.2" fill={color} />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        transform="rotate(60 12 12)"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        transform="rotate(120 12 12)"
      />
    </svg>
  );
}

export function FileTypeIcon({
  path,
  kind = 'file',
  size = 16,
  className
}: Props) {
  const ext = extOf(path);
  const spec = specFor(ext, kind);

  if (kind === 'folder') {
    return (
      <span
        className={`file-type-icon file-type-icon--folder${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size, color: spec.bg }}
        aria-hidden
      >
        <FolderGlyph size={size} />
      </span>
    );
  }

  if (ext === 'tsx' || ext === 'jsx') {
    return (
      <span
        className={`file-type-icon file-type-icon--react${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <ReactGlyph size={size} color="#61dafb" />
      </span>
    );
  }

  const fontSize = Math.max(7, Math.round(size * 0.42));
  return (
    <span
      className={`file-type-icon file-type-icon--badge${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        background: spec.bg,
        color: spec.fg || '#fff',
        fontSize
      }}
      aria-hidden
    >
      {spec.label}
    </span>
  );
}
