/**
 * CHAT-003 — Searchable Model Picker (v2.1 ModelSelector + UXPROV-003 helpers).
 * Filter/catalog logic stays in @agent-k/providers (R-001); this file is React only.
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from './Icons';
import { MODEL_TAG_LABELS, type ModelTag } from '../../providers/modelTags';
import {
  asModelPickerOption,
  matchesModelPickerFilter,
  type ModelPickerOption
} from '../../providers/modelPicker';
import { modelIdsMatch } from '../../providers/normalizeModelId';

/** Alias kept for Composer / ChatApp consumers (same DTO as UXPROV-003). */
export type ModelSelectorOption = ModelPickerOption;

interface ModelSelectorProps {
  value: string;
  options: Array<string | ModelSelectorOption>;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Short label shown on the trigger (falls back to last path segment) */
  label?: string;
  /**
   * Menu direction. Footer composer prefers `up`; pencil inline-edit uses `down`.
   * `auto` picks the side with more space.
   */
  menuPlacement?: 'up' | 'down' | 'auto';
}

type MenuPlacement = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

function shortModelName(id: string): string {
  const short = id.split('/').pop() || id;
  return short.length > 32 ? `${short.slice(0, 30)}…` : short;
}

/**
 * Composer model picker: unified list + search + optional tag/provider badges.
 * Menu is portaled + fixed so chat-root overflow:hidden does not clip it.
 */
export function ModelSelector({
  value,
  options,
  onChange,
  disabled,
  label,
  menuPlacement = 'auto'
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<ModelTag | 'all'>('all');
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState<MenuPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const allOptions = useMemo(() => {
    const mapped = options.map(asModelPickerOption);
    if (value && !mapped.some((o) => modelIdsMatch(o.id, value))) {
      return [{ id: value, label: shortModelName(value) }, ...mapped];
    }
    return mapped;
  }, [options, value]);

  const availableTags = useMemo(() => {
    const set = new Set<ModelTag>();
    for (const o of allOptions) (o.tags || []).forEach((t) => set.add(t));
    return [...set];
  }, [allOptions]);

  // UXPROV-003 — same filter as providers domain (query + tag).
  // Selected model floats to the top so the current choice is always visible.
  const filtered = useMemo(() => {
    const list = allOptions.filter((opt) =>
      matchesModelPickerFilter(opt, filter, tagFilter)
    );
    if (!value) return list;
    const sel = list.findIndex((o) => modelIdsMatch(o.id, value));
    if (sel <= 0) return list;
    const next = list.slice();
    const [item] = next.splice(sel, 1);
    next.unshift(item);
    return next;
  }, [allOptions, filter, tagFilter, value]);

  const close = useCallback(() => {
    setOpen(false);
    setFilter('');
    setTagFilter('all');
    setHighlight(0);
    setMenuPos(null);
  }, []);

  const updateMenuPos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    // VS Code webview: visualViewport matches the panel; never size past it.
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const spaceAbove = Math.max(0, r.top - gap);
    const spaceBelow = Math.max(0, vh - r.bottom - gap);
    let openUp: boolean;
    if (menuPlacement === 'up') {
      openUp = spaceAbove >= 72;
    } else if (menuPlacement === 'down') {
      // Prefer down (pencil edit); flip up only when below is too tight.
      openUp = spaceBelow < 140 && spaceAbove > spaceBelow + 24;
    } else {
      // Comment: empty-state composer sits near the top — prefer the side with
      // more room (below). Footer at bottom usually has spaceAbove >> spaceBelow.
      openUp = spaceAbove > spaceBelow && spaceAbove >= 120;
    }
    const available = openUp ? spaceAbove : spaceBelow;
    // Never exceed remaining panel space (Math.max(120, …) was overflowing + clipping).
    const maxHeight = Math.max(72, Math.min(320, available));
    const width = Math.min(
      Math.max(r.width, 256),
      Math.max(160, window.innerWidth - 16)
    );
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    if (left < 8) left = 8;
    if (openUp) {
      setMenuPos({
        left,
        width,
        maxHeight,
        bottom: Math.max(8, vh - r.top + gap)
      });
    } else {
      setMenuPos({
        left,
        width,
        maxHeight,
        top: r.bottom + gap
      });
    }
  }, [menuPlacement]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
  }, [open, updateMenuPos, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    const onReposition = () => updateMenuPos();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onReposition);
    document.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onReposition);
      document.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updateMenuPos]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

  useEffect(() => {
    if (!open) return;
    // Highlight the selected row (index 0 after pin) when the menu opens.
    const sel = filtered.findIndex((o) => modelIdsMatch(o.id, value));
    setHighlight(sel >= 0 ? sel : 0);
    const t = window.setTimeout(() => filterRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only on open

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(
      `[data-model-idx="${highlight}"]`
    ) as HTMLElement | null;
    // jsdom may omit scrollIntoView — optional chain keeps CHAT-003 tests stable
    el?.scrollIntoView?.({ block: 'nearest' });
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

  const selected = allOptions.find((o) => modelIdsMatch(o.id, value));
  const display =
    label ||
    selected?.label ||
    shortModelName(value || allOptions[0]?.id || 'Model');

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="model-selector__menu model-selector__menu--fixed"
            role="presentation"
            style={{
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              top: menuPos.top,
              bottom: menuPos.bottom
            }}
          >
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
              <div
                className="model-selector__tags"
                role="tablist"
                aria-label="Filter by tag"
              >
                <button
                  type="button"
                  className={`model-tag${tagFilter === 'all' ? ' is-active' : ''}`}
                  onClick={() => {
                    setTagFilter('all');
                    setHighlight(0);
                  }}
                >
                  All
                </button>
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`model-tag${tagFilter === tag ? ' is-active' : ''}`}
                    onClick={() => {
                      setTagFilter(tag);
                      setHighlight(0);
                    }}
                  >
                    {MODEL_TAG_LABELS[tag]}
                  </button>
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
                  const isSelected = modelIdsMatch(opt.id, value);
                  const active = idx === highlight;
                  return (
                    <li key={opt.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        data-model-idx={idx}
                        aria-selected={isSelected}
                        title={
                          opt.providerName
                            ? `${opt.label} · ${opt.providerName}`
                            : opt.id
                        }
                        className={`model-selector__item${
                          isSelected ? ' is-selected' : ''
                        }${active ? ' is-active' : ''}`}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => pick(opt.id)}
                      >
                        <span className="model-selector__item-main">
                          <span className="model-selector__item-label">
                            {opt.label}
                            {isSelected ? (
                              <span className="model-selector__item-current">
                                {' '}
                                · current
                              </span>
                            ) : null}
                          </span>
                          {opt.providerName ? (
                            <span className="model-selector__item-provider">
                              {opt.providerName}
                            </span>
                          ) : null}
                          {(opt.tags || []).length > 0 ? (
                            <span className="model-selector__item-badges">
                              {opt.tags!.map((t) => (
                                <span
                                  key={t}
                                  className={`model-badge model-badge--${t}`}
                                >
                                  {MODEL_TAG_LABELS[t]}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <span className="model-selector__item-check" aria-hidden>
                            <IconCheck size={14} />
                          </span>
                        ) : (
                          <span
                            className="model-selector__item-check"
                            aria-hidden
                          />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="model-selector-wrapper" ref={rootRef}>
      <button
        type="button"
        className={`model-selector model-selector--btn${open ? ' is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={
          selected?.providerName
            ? `${display} · ${selected.providerName}`
            : value || display
        }
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
      {menu}
    </div>
  );
}
