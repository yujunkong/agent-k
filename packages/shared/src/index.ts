/**
 * @agent-k/shared — protocol / work-event / common error types only.
 *
 * Feature IDs:
 * - SHARED-001 Extension↔Webview protocol types
 * - SHARED-002 Typed Work Event contracts (R-002)
 *
 * No business logic, React, vscode, provider HTTP, or tool executors.
 */

export * from './common/errors';
export * from './common/ids';
export * from './common/mode';
export * from './protocol';
export * from './work-events';
