/**
 * @agent-k/host — Extension Host bridge (vscode API).
 *
 * Feature IDs: EXT-001~005, HOST-001~015
 * No React UI / agent loop / tool executor body.
 */

export { activateAgentK, deactivateAgentK } from './activate';
export { ChatViewProvider } from './ChatViewProvider';
export {
  runHostChatSend,
  stopHostChatSend,
  type ChatSendContext,
  type HostLoopRuntime,
} from './chatSend';
export { AGENT_K_COMMAND_IDS, type AgentKCommandId } from './commandIds';
export {
  handleComposerSearch,
  openWorkspaceFile,
  pickAttachmentUris,
  resolveAttachmentUris,
} from './composerHost';
export {
  AGENT_K_VSCODE_CONFIG_KEYS,
  HostConfigStore,
  agentKSubKey,
  bindAgentKConfigBridge,
  bindProjectConfig,
  hostConfigStore,
} from './configBridge';
export {
  exampleProjectConfig,
  flattenProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from './configPure';
export {
  handleConfigUpdate,
  handleProjectConfigCreateExample,
  handleProjectConfigGet,
  handleProjectConfigOpen,
  handleProjectConfigSave,
  sendConfigHydrate,
} from './configProject';
export { handleWebviewMessage } from './handleWebviewMessage';
export { createNonce, getNonce } from './nonce';
export { runHostPlanExecute } from './planExecute';
export {
  abortPlanV2Generate,
  isAbortError,
  runPlanV2Generate,
  type PlanGenerateContext,
} from './planGenerate';
export {
  listWorkspaceFilePaths,
  primaryWorkspaceRepoRoot,
} from './planWorkspaceIndex';
export {
  classifyProbeResult,
  refreshModelContext,
  runProviderConnectionTest,
} from './providerProbe';
export { registerCommands } from './registerCommands';
export { replyToWebviewMessage } from './replyToWebviewMessage';
export {
  debugLogServer,
  mcpClient,
  sessionUsageTracker,
  setUsageStatusBarItem,
  updateUsageStatusBar,
  usageStatusBarItem,
} from './runtimeSingletons';
export {
  persistSessionsToHost,
  restoreCheckpoint,
  sendCheckpointList,
  sendSessionHydration,
} from './sessionHost';
export {
  SUBAGENT_MAX_TURNS,
  createSubagentHost,
  modeForSubagentRole,
  promptFromTaskArgs,
  roleFromTaskArgs,
} from './subagentHost';
export {
  handleWorktreeApplyMessage,
  handleWorktreeRejectMessage,
  handleWorktreeReviewMessage,
} from './subagentWorktreeBridge';
export {
  applyRegisteredSubagentWorktree,
  clearSubagentWorktreeRegistry,
  getRegisteredSubagentWorktree,
  registerSubagentWorktree,
  rejectRegisteredSubagentWorktree,
  reviewRegisteredSubagentWorktree,
  unregisterSubagentWorktree,
} from './subagentWorktreeRegistry';
export {
  formatReadLineWindow,
  kindVerb,
  pickExploreDetail,
  resultDetail,
  shortDetail,
  toolKind,
} from './timelineLabels';
export { buildShellHtml, getWebviewHtml } from './webviewHtml';
export { buildWebviewCsp } from './webviewCsp';
export {
  createWorktreeManager,
  WorktreeManager,
  type AgentWorktree,
  type WorktreeStatus,
} from './worktreeManager';
export {
  resolveWorkspaceRelativeSegments,
  toWorkspaceRelativePath,
  type WorkspaceFolderLike,
} from './workspacePaths';
