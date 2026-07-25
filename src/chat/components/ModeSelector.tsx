import React from 'react';

interface ModeSelectorProps {
  value: 'ask' | 'agent' | 'plan' | 'debug';
  onChange: (mode: 'ask' | 'agent' | 'plan' | 'debug') => void;
  disabled?: boolean;
  labels: Record<string, string>;
  tooltips: Record<string, string>;
}

export function ModeSelector({ value, onChange, disabled, labels, tooltips }: ModeSelectorProps) {
  const modes = ['ask', 'agent', 'plan', 'debug'] as const;

  return (
    <div className="mode-selector-wrapper">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as any)}
        disabled={disabled}
        className="mode-selector"
        title="Select mode"
      >
        {modes.map((mode) => (
          <option key={mode} value={mode} title={tooltips[mode]}>
            {labels[mode]}
          </option>
        ))}
      </select>
      {disabled && <span className="mode-locked">🔒 Streaming</span>}
    </div>
  );
}