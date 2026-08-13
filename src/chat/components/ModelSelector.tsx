import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';
import { IconCheck, IconChevronDown } from './Icons';

interface ModelSelectorProps {
  value: string;
  options: string[];
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Short label shown on the trigger (falls back to last path segment) */
  label?: string;
}

function shortModelName(id: string): string {
  const short = id.split('/').pop() || id;
  return short.length > 32 ? `${short.slice(0, 30)}…` : short;
}

function matchesFilter(id: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const short = (id.split('/').pop() || id).toLowerCase();
  return id.toLowerCase().includes(q) || short.includes(q);
}

/**
 * Composer model picker with type-to-filter (native &lt;select&gt; cannot search).
 */
export function ModelSelector({
  value,
  options,
  onChange,
  disabled,
  label
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const allOptions = useMemo(() => {
    if (value && !options.includes(value)) return [value, ...options];
    return options;
  }, [options, value]);

  const filtered = useMemo(
    () => allOptions.filter((id) => matchesFilter(id, filter)),
    [allOptions, filter]
  );

  const close = useCallback(() => {
    setOpen(false);
    setFilter('');
    setHighlight(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
    const t = window.setTimeout(() => filterRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(
      `[data-model-idx="${highlight}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open, filtered]);

  const pick = (id: string) => {
    onChange(id);
    close();
  };

  const onFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setHighlight((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const id = filtered[highlight];
      if (id) pick(id);
      return;
    }
  };

  const display = label || shortModelName(value || allOptions[0] || 'Model');

  return (
    <div className="model-selector-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`model-selector model-selector--btn${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={value || display}
        aria-label={`Model: ${value || display}`}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <span className="model-selector__label">{display}</span>
        <span className="model-selector__chevron" aria-hidden>
          <IconChevronDown size={12} />
        </span>
      </button>

      {open ? (
        <div className="model-selector__menu" role="presentation">
          <div className="model-selector__filter">
            <input
              ref={filterRef}
              type="text"
              className="model-selector__filter-input"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onFilterKeyDown}
              placeholder="Filter models…"
              aria-label="Filter models"
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <ul
            id={listId}
            className="model-selector__list"
            role="listbox"
            aria-label="Models"
            ref={listRef}
          >
            {filtered.length === 0 ? (
              <li className="model-selector__empty" role="presentation">
                No matches
              </li>
            ) : (
              filtered.map((id, idx) => {
                const selected = id === value;
                const active = idx === highlight;
                return (
                  <li key={id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      data-model-idx={idx}
                      aria-selected={selected}
                      title={id}
                      className={`model-selector__item${
                        selected ? ' is-selected' : ''
                      }${active ? ' is-active' : ''}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pick(id)}
                    >
                      <span className="model-selector__item-label">
                        {shortModelName(id)}
                      </span>
                      {selected ? (
                        <span className="model-selector__item-check" aria-hidden>
                          <IconCheck size={14} />
                        </span>
                      ) : (
                        <span className="model-selector__item-check" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
