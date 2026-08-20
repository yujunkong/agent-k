import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';
import { IconCheck, IconChevronDown } from './Icons';
import { MODEL_TAG_LABELS, type ModelTag } from '../../providers/modelTags';

export interface ModelSelectorOption {
  id: string;
  label: string;
  providerName?: string;
  tags?: ModelTag[];
}

interface ModelSelectorProps {
  value: string;
  options: Array<string | ModelSelectorOption>;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Short label shown on the trigger (falls back to last path segment) */
  label?: string;
}

function shortModelName(id: string): string {
  const short = id.split('/').pop() || id;
  return short.length > 32 ? `${short.slice(0, 30)}…` : short;
}

function asOption(item: string | ModelSelectorOption): ModelSelectorOption {
  if (typeof item === 'string') {
    return { id: item, label: shortModelName(item) };
  }
  return item;
}

function matchesFilter(opt: ModelSelectorOption, query: string, tag: ModelTag | 'all'): boolean {
  if (tag !== 'all' && !(opt.tags || []).includes(tag)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [opt.id, opt.label, opt.providerName, ...(opt.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/**
 * Composer model picker: unified list + search + optional tag/provider badges.
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
  const [tagFilter, setTagFilter] = useState<ModelTag | 'all'>('all');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const allOptions = useMemo(() => {
    const mapped = options.map(asOption);
    if (value && !mapped.some((o) => o.id === value)) {
      return [{ id: value, label: shortModelName(value) }, ...mapped];
    }
    return mapped;
  }, [options, value]);

  const availableTags = useMemo(() => {
    const set = new Set<ModelTag>();
    for (const o of allOptions) (o.tags || []).forEach((t) => set.add(t));
    return [...set];
  }, [allOptions]);

  const filtered = useMemo(
    () => allOptions.filter((opt) => matchesFilter(opt, filter, tagFilter)),
    [allOptions, filter, tagFilter]
  );

  const close = useCallback(() => {
    setOpen(false);
    setFilter('');
    setTagFilter('all');
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
      const id = filtered[highlight]?.id;
      if (id) pick(id);
      return;
    }
  };

  const selected = allOptions.find((o) => o.id === value);
  const display = label || selected?.label || shortModelName(value || allOptions[0]?.id || 'Model');

  return (
    <div className="model-selector-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`model-selector model-selector--btn${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={selected?.providerName ? `${display} · ${selected.providerName}` : value || display}
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
              placeholder="Search models…"
              aria-label="Search models"
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {availableTags.length > 0 ? (
            <div className="model-selector__tags" role="tablist" aria-label="Filter by tag">
              <button
                type="button"
                className={`model-tag${tagFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => { setTagFilter('all'); setHighlight(0); }}
              >All</button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`model-tag${tagFilter === tag ? ' is-active' : ''}`}
                  onClick={() => { setTagFilter(tag); setHighlight(0); }}
                >{MODEL_TAG_LABELS[tag]}</button>
              ))}
            </div>
          ) : null}
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
              filtered.map((opt, idx) => {
                const isSelected = opt.id === value;
                const active = idx === highlight;
                return (
                  <li key={opt.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      data-model-idx={idx}
                      aria-selected={isSelected}
                      title={opt.providerName ? `${opt.label} · ${opt.providerName}` : opt.id}
                      className={`model-selector__item${
                        isSelected ? ' is-selected' : ''
                      }${active ? ' is-active' : ''}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pick(opt.id)}
                    >
                      <span className="model-selector__item-main">
                        <span className="model-selector__item-label">{opt.label}</span>
                        {opt.providerName ? (
                          <span className="model-selector__item-provider">{opt.providerName}</span>
                        ) : null}
                        {(opt.tags || []).length > 0 ? (
                          <span className="model-selector__item-badges">
                            {opt.tags!.map((t) => (
                              <span key={t} className={`model-badge model-badge--${t}`}>{MODEL_TAG_LABELS[t]}</span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? (
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
