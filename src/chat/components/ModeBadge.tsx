/**
 * ModeBadge - 모드 표시 배지 + Read-only 잠금 아이콘 (C1-T19)
 */
import React from 'react';
import type { Mode } from '../../agent/types';
import { IconBug, IconInfinity, IconList, IconMessage } from './Icons';

interface ModeBadgeProps {
  mode: Mode;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  showLabel?: boolean;
}

const MODE_INFO: Record<
  Mode,
  { label: string; color: string; readOnly: boolean; Icon: React.FC<{ size?: number }> }
> = {
  ask: { label: 'Ask', color: '#3b82f6', readOnly: true, Icon: IconMessage },
  agent: { label: 'Agent', color: '#f59e0b', readOnly: false, Icon: IconInfinity },
  plan: { label: 'Plan', color: '#8b5cf6', readOnly: false, Icon: IconList },
  debug: { label: 'Debug', color: '#ef4444', readOnly: false, Icon: IconBug }
};

export function ModeBadge({
  mode,
  size = 'medium',
  showIcon = true,
  showLabel = true
}: ModeBadgeProps) {
  const info = MODE_INFO[mode];
  const Icon = info.Icon;

  const sizeStyles = {
    small: { padding: '1px 6px', fontSize: '0.7em', borderRadius: 3, icon: 11 },
    medium: { padding: '2px 10px', fontSize: '0.8em', borderRadius: 4, icon: 13 },
    large: { padding: '4px 14px', fontSize: '0.9em', borderRadius: 6, icon: 14 }
  };
  const s = sizeStyles[size];

  return (
    <span
      className="mode-badge"
      title={`${mode} mode${info.readOnly ? ' — Read-only' : ''}`}
      style={{
        padding: s.padding,
        fontSize: s.fontSize,
        borderRadius: s.borderRadius,
        background: `${info.color}20`,
        color: info.color,
        border: `1px solid ${info.color}40`,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        letterSpacing: '0.02em'
      }}
    >
      {showIcon ? <Icon size={s.icon} /> : null}
      {showLabel ? <span>{info.label}</span> : null}
    </span>
  );
}
