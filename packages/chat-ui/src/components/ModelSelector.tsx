/**
 * CHAT-003 — Searchable model picker UI (v2.1 chrome).
 * Options are supplied by parent / host; no provider HTTP in chat-ui.
 */
import { useEffect, useId, useMemo, useRef, useState, type JSX } from 'react';
import { IconCheck, IconChevronDown } from './Icons';

export type ModelOption = {
  id: string;
  label: string;
  description?: string;
  badges?: string[];
};

export type ModelSelectorProps = {
  value: string;
  options: ModelOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (modelId: string) => void;
  onOpenSettings?: () => void;
};

export function ModelSelector(props: ModelSelectorProps): JSX.Element {
  const {
    value,
    options,
    disabled,
    placeholder = 'Select model',
    onChange,
    onOpenSettings,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        (o.description ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="model-selector-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`model-selector model-selector--btn${open ? ' is-open' : ''}`}
        data-testid="chat-model-picker"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="model-selector__label">
          {selected?.label || value || placeholder}
        </span>
        <span className="model-selector__chevron" aria-hidden>
          <IconChevronDown size={12} />
        </span>
      </button>
      {open ? (
        <div className="model-selector__menu" id={listId} role="listbox">
          <div className="model-selector__filter">
            <input
              className="model-selector__filter-input"
              data-testid="chat-model-filter"
              value={query}
              placeholder="Search models…"
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="model-selector__list">
            {filtered.length === 0 ? (
              <li className="model-selector__empty">No matches</li>
            ) : (
              filtered.map((o) => {
                const active = o.id === value;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`model-selector__item${active ? ' is-selected' : ''}`}
                      onClick={() => {
                        onChange(o.id);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <span className="model-selector__item-label">{o.label}</span>
                      {o.badges?.length ? (
                        <span className="model-selector__item-badges">
                          {o.badges.map((b) => (
                            <span key={b} className="model-badge">
                              {b}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {active ? (
                        <span className="model-selector__item-check" aria-hidden>
                          <IconCheck size={14} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {onOpenSettings ? (
            <button
              type="button"
              className="model-selector__footer-btn"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              Open Models settings…
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
