/**
 * 모델명 정규화 레이어.
 * qwen3-coder / Qwen3-Coder / Qwen/Qwen3-Coder 를 같은 키로 묶어
 * Composer 중복 제거가 깨지지 않게 한다.
 */

/** 소문자 + 하이픈 통일 + org 프리픽스 제거 */
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

/** Composer / 설정에 보여줄 짧은 이름 (원본 마지막 세그먼트 유지) */
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
