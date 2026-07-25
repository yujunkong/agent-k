import React from 'react';

interface ModeSelectorProps {
  value: 'ask' | 'agent' | 'plan' | 'debug';
  onChange: (mode: 'ask' | 'agent' | 'plan' | 'debug') => void;
  disabled?: boolean;
  labels: Record<string, string>;
  tooltips: Record<string, string>;
}

/**
 * Mode dropdown (Ask / Agent / Plan / Debug).
 * While streaming, select is disabled — show lock hint beside the control, never overlaid on the label.
 */
export function ModeSelector({ value, onChange, disabled, labels, tooltips }: ModeSelectorProps) {
  const modes = ['ask', 'agent', 'plan', 'debug'] as const;

  return (
    <div className="mode-selector-wrapper">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as typeof modes[number])}
        disabled={disabled}
        className="mode-selector"
        title={disabled ? 'Mode locked while streaming' : tooltips[value] || 'Select mode'}
        aria-label="Agent mode"
      >
        {modes.map((mode) => (
          <option key={mode} value={mode} title={tooltips[mode]}>
            {labels[mode]}
          </option>
        ))}
      </select>
      {/* Beside the select — absolute overlay was covering "Agent" with "🔒 Streaming" */}
      {disabled ? (
        <span className="mode-locked" title="Mode locked while streaming" aria-live="polite">
          🔒
        </span>
      ) : null}
    </div>
  );
}
