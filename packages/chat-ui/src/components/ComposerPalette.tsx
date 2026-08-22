/**
 * CHAT-011 — Composer slash/context palette chrome (v2.1).
 */
import type { JSX } from 'react';

export type PaletteItem = { id: string; label: string; description?: string };

export type ComposerPaletteProps = {
  open: boolean;
  title?: string;
  items: PaletteItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function ComposerPalette(props: ComposerPaletteProps): JSX.Element | null {
  const { open, title = 'Commands', items, onSelect, onClose } = props;
  if (!open) return null;
  return (
    <div className="composer-palette" data-testid="ui-composer-palette" role="listbox">
      <div className="composer-palette__main">
        <div className="composer-palette__header">
          <span className="composer-palette__title">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close palette">
            ✕
          </button>
        </div>
        <ul className="composer-palette__list">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className="composer-palette__item"
                onClick={() => onSelect(it.id)}
              >
                <span className="composer-palette__label">{it.label}</span>
                {it.description ? (
                  <span className="composer-palette__desc">{it.description}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
