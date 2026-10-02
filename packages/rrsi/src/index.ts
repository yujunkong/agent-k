/**
 * @agent-k/rrsi — Regularized Recursive Self-Improvement of Agent-K harnesses.
 *
 * Ported from google-research/rrsi (Apache-2.0). The search core is pure
 * data + functions; the only write surface into Agent-K is validated JSON
 * policy files under harness/policies/.
 *
 *   Evidence   evidence/   — S_hat/C_hat from trials (missing trial = 0)
 *   Search     search/     — Algorithm 1/2 (history, schedule, selection,
 *                            components, critic pre-checks)
 *   Policy     policy/     — schema-validated harness policy (RRSI write surface)
 */

export * from './types';
export * from './evidence/evaluate';
export * from './search/selection';
export * from './search/history';
export * from './search/schedule';
export * from './search/components';
export * from './search/critic';
export * from './policy/schema';
export * from './trajectory/recorder';
export * from './domain/domain';
export * from './search/propose';
export * from './domain/loop';
export * from './search/calibrate';
export * from './search/criticLlm';
