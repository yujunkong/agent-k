/**
 * packages/chat-ui/src/chat/app/index.ts — re-exports
 *
 * ChatApp.tsx의 훅·컴포넌트 분리 결과물.
 * main.tsx는 여전히 ChatApp을 `./ChatApp`에서 import하므로 이 파일은
 * internal cross-module 접근 편의용.
 */
export { useChatPanels } from './useChatPanels';
export type { UseChatPanelsParams, UseChatPanelsReturn, SettingsTabId } from './useChatPanels';
export { SETTINGS_TAB_IDS } from './useChatPanels';

export { useChatFileEdits } from './useChatFileEdits';
export type { UseChatFileEditsParams, UseChatFileEditsReturn } from './useChatFileEdits';

export { useChatWorktree } from './useChatWorktree';
export type { UseChatWorktreeParams, UseChatWorktreeReturn } from './useChatWorktree';

export { useChatProvider } from './useChatProvider';
export type { UseChatProviderReturn } from './useChatProvider';

export { useChatDebugMode } from './useChatDebugMode';
export type { UseChatDebugModeParams, UseChatDebugModeReturn } from './useChatDebugMode';

export { useChatPlanMode } from './useChatPlanMode';
export type { UseChatPlanModeParams, UseChatPlanModeReturn } from './useChatPlanMode';

export { useChatSendFlow } from './useChatSendFlow';
export type { UseChatSendFlowParams, UseChatSendFlowReturn } from './useChatSendFlow';

export { ChatModeChrome } from './ChatModeChrome';
export type { ChatModeChromeProps } from './ChatModeChrome';

export { ChatComposerFooter } from './ChatComposerFooter';
export type { ChatComposerFooterProps } from './ChatComposerFooter';

export { useChatHostBridge } from './useChatHostBridge';
export type { UseChatHostBridgeParams } from './useChatHostBridge';
