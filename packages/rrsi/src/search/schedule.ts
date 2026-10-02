/**
 * Annealed L0 edit budget — port of rrsi/schedule.py.
 *
 *   b_t = ceil(b_min + (b_max − b_min) · ½(1 + cos(π t / T))),  t = 0..T−1
 *
 * Early rounds may bundle several coordinated edits; late rounds become
 * sparse and attributable.
 */

export function editBudget(t: number, T: number, bMin: number, bMax: number): number {
  if (T <= 0) return Math.max(1, Math.floor(bMax));
  const tt = Math.max(0, Math.min(t, T));
  const v = bMin + (bMax - bMin) * 0.5 * (1 + Math.cos((Math.PI * tt) / T));
  return Math.ceil(Number(v.toFixed(9)));
}

export function budgetTable(T: number, bMin: number, bMax: number): number[] {
  return Array.from({ length: T }, (_, t) => editBudget(t, T, bMin, bMax));
}
