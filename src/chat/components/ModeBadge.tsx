/**
 * ModeBadge - 모드 표시 배지 + Read-only 잠금 아이콘 (C1-T19)
 */
import React from 'react';
import type { Mode } from '../../agent/types';

interface ModeBadgeProps {
  mode: Mode;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  showLabel?: boolean;
}

const MODE_INFO: Record<Mode, { icon: string; label: string; color: string; readOnly: boolean }> = {
  ask: { icon: '🔒', label: 'Read-only', color: '#3b82f6', readOnly: true },
  agent: { icon: '🤖', label: 'Agent', color: '#f59e0b', readOnly: false },
  plan: { icon: '📋', label: 'Plan', color: '#8b5cf6', readOnly: false },
  debug: { icon: '🔍', label: 'Debug', color: '#ef4444', readOnly: false }
};

export function ModeBadge({ mode, size = 'medium', showIcon = true, showLabel = true }: ModeBadgeProps) {
  const info = MODE_INFO[mode];

  const sizeStyles = {
    small: { padding: '1px 6px', fontSize: '0.7em', borderRadius: 3 },
    medium: { padding: '2px 10px', fontSize: '0.8em', borderRadius: 4 },
    large: { padding: '4px 14px', fontSize: '0.9em', borderRadius: 6 }
  };

  return (
    <span
      className="mode-badge"
      title={`${mode} mode${info.readOnly ? ' — 🔒 Read-only' : ''}`}
      style={{
        ...sizeStyles[size],
        background: `${info.color}20`,
        color: info.color,
        border: `1px solid ${info.color}40`,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.02em'
      }}
    >
      {showIcon && <span>{info.icon}</span>}
      {showLabel && <span>{info.label}</span>}
    </span>
  );
}
