/**
 * VS Code webview API accessor — re-exports the cached chat/vscodeApi getter.
 * NEVER call acquireVsCodeApi more than once (fatal in VS Code webviews).
 */
export type { VsCodeApi } from '../vscodeApi';
export { getVsCodeApi, setVsCodeApiForTests } from '../vscodeApi';
