/**
 * Dropdown for Composer @ (files) and / (commands).
 * Mention UI: Cursor-like row (icon · name · path hint) + tree preview.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import type { MentionHit, SlashCommand } from '../composerPalette';
import {
  abbreviatePathHint,
  parentRelPath,
  pathPreviewSegments
} from '../composerPalette';
import { FileTypeIcon } from './FileTypeIcon';
import {
  IconBug,
  IconInfinity,
  IconList,
  IconMessage,
  IconPlus,
  IconRefresh,
  IconSettings
} from './Icons';

export type PaletteItem =
  | { type: 'mention'; hit: MentionHit }
  | { type: 'slash'; cmd: SlashCommand };

interface ComposerPaletteProps {
  kind: 'mention' | 'slash';
  items: PaletteItem[];
  selectedIndex: number;
  loading?: boolean;
  query?: string;
  onSelect: (item: PaletteItem) => void;
  onHover: (index: number) => void;
}

function SlashIcon({ cmd }: { cmd: SlashCommand }) {
  if (cmd.action === 'newChat') return <IconPlus size={14} />;
  if (cmd.action === 'settings' || cmd.action === 'model' || cmd.action === 'permissions') {
    return <IconSettings size={14} />;
  }
  if (cmd.action === 'compact') return <IconRefresh size={14} />;
  if (cmd.action === 'cost') return <IconMessage size={14} />;
  if (cmd.action === 'help') return <IconList size={14} />;
  if (cmd.mode === 'agent') return <IconInfinity size={14} />;
  if (cmd.mode === 'plan') return <IconList size={14} />;
  if (cmd.mode === 'debug') return <IconBug size={14} />;
  if (cmd.mode === 'ask') return <IconMessage size={14} />;
  return <IconPlus size={14} />;
}

function MentionTreePreview({ hit }: { hit: MentionHit }) {
  const rel = hit.description || hit.path;
  const segments = pathPreviewSegments(rel, hit.kind, hit.label);
  if (segments.length === 0) return null;

  return (
    <div className="composer-palette__preview" aria-hidden>
      <div className="composer-palette__tree">
        {segments.map((seg, i) => (
          <div
            key={`${seg.kind}-${seg.name}-${i}`}
            className={`composer-palette__tree-row${
              i === segments.length - 1 ? ' is-leaf' : ''
            }`}
            style={{ paddingLeft: 8 + i * 12 }}
          >
            <FileTypeIcon
              path={seg.name}
              kind={seg.kind}
              size={seg.kind === 'folder' ? 14 : 15}
            />
            <span className="composer-palette__tree-name">{seg.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComposerPalette({
  kind,
  items,
  selectedIndex,
  loading,
  query,
  onSelect,
  onHover
}: ComposerPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-palette-idx="${selectedIndex}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectedMention = useMemo(() => {
    if (kind !== 'mention') return null;
    const item = items[selectedIndex];
    return item?.type === 'mention' ? item.hit : null;
  }, [kind, items, selectedIndex]);

  return (
    <div
      className={`composer-palette${
        kind === 'mention' ? ' composer-palette--mention' : ''
      }`}
      role="listbox"
      aria-label={kind === 'mention' ? '파일 멘션' : '슬래시 커맨드'}
    >
      <div className="composer-palette__main">
        <div className="composer-palette__header">
          {kind === 'mention' ? (
            <>
              <span className="composer-palette__title">Files</span>
              {query ? (
                <span className="composer-palette__query">@{query}</span>
              ) : (
                <span className="composer-palette__hint">Search files</span>
              )}
            </>
          ) : (
            <>
              <span className="composer-palette__title">Commands</span>
              <span className="composer-palette__hint">Built-in</span>
            </>
          )}
        </div>
        <div className="composer-palette__list" ref={listRef}>
          {loading && items.length === 0 ? (
            <div className="composer-palette__empty">검색 중…</div>
          ) : items.length === 0 ? (
            <div className="composer-palette__empty">
              {kind === 'mention' ? '결과 없음' : '일치하는 명령 없음'}
            </div>
          ) : (
            items.map((item, idx) => {
              const selected = idx === selectedIndex;
              if (item.type === 'mention') {
                const { hit } = item;
                const parent = parentRelPath(
                  hit.description || hit.path,
                  hit.kind
                );
                const hint = abbreviatePathHint(parent);
                return (
                  <button
                    key={`${hit.kind}:${hit.path}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-palette-idx={idx}
                    className={`composer-palette__item composer-palette__item--row${
                      selected ? ' is-selected' : ''
                    }`}
                    onMouseEnter={() => onHover(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(item);
                    }}
                  >
                    <span className="composer-palette__icon" aria-hidden>
                      <FileTypeIcon
                        path={hit.label || hit.path}
                        kind={hit.kind}
                        size={16}
                      />
                    </span>
                    <span className="composer-palette__name">{hit.label}</span>
                    {hint ? (
                      <span className="composer-palette__path">{hint}</span>
                    ) : null}
                  </button>
                );
              }
              const { cmd } = item;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-palette-idx={idx}
                  className={`composer-palette__item composer-palette__item--row${
                    selected ? ' is-selected' : ''
                  }`}
                  onMouseEnter={() => onHover(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item);
                  }}
                >
                  <span className="composer-palette__icon" aria-hidden>
                    <SlashIcon cmd={cmd} />
                  </span>
                  <span className="composer-palette__name">{cmd.label}</span>
                  <span className="composer-palette__path">{cmd.description}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
      {kind === 'mention' && selectedMention ? (
        <MentionTreePreview hit={selectedMention} />
      ) : null}
    </div>
  );
}
