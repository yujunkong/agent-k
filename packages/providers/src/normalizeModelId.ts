/**
 * Model id normalize helpers (used by PROVIDER-003/004; full MODEL-004 later).
 */

export function normalizeModelId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const last = trimmed.split('/').pop() || trimmed;
  return last
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function displayModelName(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const last = trimmed.split('/').pop() || trimmed;
  return last.replace(/_/g, '-');
}

export function modelIdsMatch(a: string, b: string): boolean {
  const na = normalizeModelId(a);
  const nb = normalizeModelId(b);
  return !!na && na === nb;
}
