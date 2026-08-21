/**
 * UXPROV-003 — Searchable model picker helpers (no React).
 * chat-ui ModelSelector consumes these DTOs later.
 */
import type { ModelTag } from './modelTags';
import { listUnifiedModels } from './ModelRegistry';

export interface ModelPickerOption {
  id: string;
  label: string;
  providerName?: string;
  tags?: ModelTag[];
}

function shortModelName(id: string): string {
  const short = id.split('/').pop() || id;
  return short.length > 32 ? `${short.slice(0, 30)}…` : short;
}

export function asModelPickerOption(item: string | ModelPickerOption): ModelPickerOption {
  if (typeof item === 'string') {
    return { id: item, label: shortModelName(item) };
  }
  return item;
}

/** Build picker options from unified registry (provider badge = first connection name). */
export function unifiedModelsToPickerOptions(): ModelPickerOption[] {
  return listUnifiedModels().map((m) => ({
    id: m.canonicalId,
    label: m.displayName,
    providerName: m.providers[0]?.connectionName,
    tags: m.tags,
  }));
}

export function matchesModelPickerFilter(
  opt: ModelPickerOption,
  query: string,
  tag: ModelTag | 'all' = 'all',
): boolean {
  if (tag !== 'all' && !(opt.tags || []).includes(tag)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [opt.id, opt.label, opt.providerName, ...(opt.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function filterModelOptions(
  options: Array<string | ModelPickerOption>,
  opts: { query?: string; tag?: ModelTag | 'all' } = {},
): ModelPickerOption[] {
  const query = opts.query ?? '';
  const tag = opts.tag ?? 'all';
  return options
    .map(asModelPickerOption)
    .filter((opt) => matchesModelPickerFilter(opt, query, tag));
}
