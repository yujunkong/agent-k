import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  IconBug,
  IconCheck,
  IconChevronDown,
  IconInfinity,
  IconList,
  IconMessage,
  IconSpark
} from './Icons';
import type { ModePicker } from '../types';

interface ModeSelectorProps {
  value: ModePicker;
  onChange: (mode: ModePicker) => void;
  disabled?: boolean;
  labels: Record<string, string>;
  tooltips: Record<string, string>;
}

/** Auto first, then Cursor-like: Agent → Plan → Debug → Ask */
const MODES: ModePicker[] = ['auto', 'agent', 'plan', 'debug', 'ask'];

function ModeIcon({ mode, size = 14 }: { mode: ModePicker; size?: number }) {
  switch (mode) {
    case 'auto':
      return <IconSpark size={size} />;
    case 'agent':
      return <IconInfinity size={size} />;
    case 'plan':
      return <IconList size={size} />;
    case 'debug':
      return <IconBug size={size} />;
    case 'ask':
      return <IconMessage size={size} />;
    default:
      return null;
  }
}

/**
 * Mode dropdown (Agent / Plan / Debug / Ask) with clean stroke icons.
 * Native <select> cannot show per-option icons — custom menu matches Cursor.
 */
export function ModeSelector({
  value: valueProp,
  onChange,
  disabled,
  labels,
  tooltips
}: ModeSelectorProps) {
  // Comment: missing mode prop must not collapse the pill to icon-less empty
  const value: ModePicker =
    valueProp && MODES.includes(valueProp) ? valueProp : 'agent';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const pick = (mode: ModePicker) => {
    onChange(mode);
    setOpen(false);
  };

  return (
    <div className="mode-selector-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`mode-selector mode-selector--btn${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={
          disabled
            ? 'Mode locked while streaming'
            : open
              ? undefined
              : tooltips[value] || 'Select mode'
        }
        aria-label={`Mode: ${labels[value] || value}`}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <span className="mode-selector__icon" aria-hidden>
          <ModeIcon mode={value} size={13} />
        </span>
        <span className="mode-selector__label">{labels[value] || value}</span>
        <span className="mode-selector__chevron" aria-hidden>
          <IconChevronDown size={12} />
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          className="mode-selector__menu"
          role="listbox"
          aria-label="Agent mode"
        >
          {MODES.map((mode) => {
            const selected = mode === value;
            return (
              <li key={mode} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`mode-selector__item${selected ? ' is-selected' : ''}`}
                  onClick={() => pick(mode)}
                >
                  <span className="mode-selector__item-icon" aria-hidden>
                    <ModeIcon mode={mode} size={14} />
                  </span>
                  <span className="mode-selector__item-label">
                    {labels[mode] || mode}
                  </span>
                  {selected ? (
                    <span className="mode-selector__item-check" aria-hidden>
                      <IconCheck size={14} />
                    </span>
                  ) : (
                    <span className="mode-selector__item-check" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {disabled ? (
        <span className="mode-locked" title="Mode locked while streaming" aria-live="polite">
          🔒
        </span>
      ) : null}
    </div>
  );
}
