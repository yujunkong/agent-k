/**
 * V31-UI-07 — Thinking effort dropdown (replaces the native <select>).
 * Custom menu so the trigger can use the shared stroke chevron icon.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from './Icons';

export interface ThinkingSelectorOption {
  value: string;
  label: string;
  title?: string;
}

interface ThinkingSelectorProps {
  value: string;
  options: ThinkingSelectorOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Accessible name for trigger + menu (defaults to "Thinking effort"). */
  label?: string;
}

export function ThinkingSelector({
  value,
  options,
  onChange,
  disabled,
  label = 'Thinking effort'
}: ThinkingSelectorProps) {
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

  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="composer-thinking-select-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`composer-thinking-select${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={selected?.title || label}
        aria-label={label}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <span className="composer-thinking-select__label">
          {selected?.label || value}
        </span>
        <span className="composer-thinking-select__chevron" aria-hidden>
          <IconChevronDown size={12} />
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          className="composer-thinking-select__menu"
          role="listbox"
          aria-label={label}
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  title={o.title}
                  className={`composer-thinking-select__item${
                    isSelected ? ' is-selected' : ''
                  }`}
                  onClick={() => pick(o.value)}
                >
                  <span className="composer-thinking-select__item-label">
                    {o.label}
                  </span>
                  {isSelected ? (
                    <span
                      className="composer-thinking-select__item-check"
                      aria-hidden
                    >
                      <IconCheck size={14} />
                    </span>
                  ) : (
                    <span
                      className="composer-thinking-select__item-check"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
