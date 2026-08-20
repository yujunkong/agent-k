/**
 * Per-tab send epoch.
 *
 * Stop / resynth / a second tab's send used to increment one global counter.
 * The first tab's stream then treated every delta as stale and froze
 * ("먹통") even though the host loop was still running.
 */
export class SendEpochMap {
  private readonly epochs = new Map<string, number>();

  /** Bump one session only. Returns the new epoch for that session. */
  bump(sessionId: string): number {
    const id = String(sessionId || '');
    const next = (this.epochs.get(id) || 0) + 1;
    this.epochs.set(id, next);
    return next;
  }

  get(sessionId: string): number {
    return this.epochs.get(String(sessionId || '')) || 0;
  }

  /** True when this turn was superseded on the same session (not another tab). */
  isStale(sessionId: string, epoch: number): boolean {
    return epoch !== this.get(sessionId);
  }

  clear(sessionId: string): void {
    this.epochs.delete(String(sessionId || ''));
  }
}
