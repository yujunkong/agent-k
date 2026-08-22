/**
 * useChatPanels — 사이드 패널 UI 상태 (Settings / History / Design / Review / Artifacts)
 *
 * 담당: showSettings, showHistory, showDesignMode, showReview, showArtifacts 상태 +
 *       토글·닫기 핸들러 + handleAcceptFinding
 */
import { useState, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import { AcceptFix } from '../../review/AcceptFix';
import type { ReviewFinding } from '../../review/AgentReviewLoop';
import type { Artifact } from '../../artifacts/ArtifactStore';

// Settings 탭 ID 목록 (좁은 범위이므로 여기서 선언)
export const SETTINGS_TAB_IDS = [
  'models',
  'permission',
  'queue',
  'harness',
  'context',
  'mcp',
  'features',
  'privacy',
  'json',
] as const;
export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

function readLastSettingsTab(): SettingsTabId {
  try {
    const v = localStorage.getItem('agent-k.settings.lastTab');
    if (v && (SETTINGS_TAB_IDS as readonly string[]).includes(v)) {
      return v as SettingsTabId;
    }
  } catch {
    /* ignore */
  }
  return 'models';
}

export interface UseChatPanelsParams {
  /** Settings 닫기 시 provider 탭 복원 (useChatProvider에서 주입) */
  restoreProviderForSession: (id: string) => void;
  /** Settings 닫기 후 Composer 모델 목록 갱신 콜백 */
  onSettingsClosed?: () => void;
  /** 현재 세션 ID ref — handleCloseSettings에서 탭 복원 시 사용 */
  currentSessionIdRef: MutableRefObject<string>;
}

export interface UseChatPanelsReturn {
  // Settings
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  settingsTab: SettingsTabId;
  rememberSettingsTab: (tab: SettingsTabId) => void;
  handleToggleSettings: (e?: React.MouseEvent) => void;
  handleCloseSettings: () => void;
  // History
  showHistory: boolean;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  handleToggleHistory: (e?: React.MouseEvent) => void;
  handleCloseHistory: () => void;
  // Design Mode
  showDesignMode: boolean;
  setShowDesignMode: Dispatch<SetStateAction<boolean>>;
  // Review (코드 리뷰 패널)
  showReview: boolean;
  setShowReview: Dispatch<SetStateAction<boolean>>;
  reviewFindings: ReviewFinding[];
  setReviewFindings: Dispatch<SetStateAction<ReviewFinding[]>>;
  handleAcceptFinding: (id: string) => Promise<void>;
  // Artifacts
  showArtifacts: boolean;
  setShowArtifacts: Dispatch<SetStateAction<boolean>>;
  artifacts: Artifact[];
  setArtifacts: Dispatch<SetStateAction<Artifact[]>>;
}

export function useChatPanels(params: UseChatPanelsParams): UseChatPanelsReturn {
  const { restoreProviderForSession, onSettingsClosed, currentSessionIdRef } = params;

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(readLastSettingsTab);
  const [showHistory, setShowHistory] = useState(false);
  const [showDesignMode, setShowDesignMode] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewFindings, setReviewFindings] = useState<ReviewFinding[]>([]);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  // AcceptFix 인스턴스 — 컴포넌트 생명주기와 동일하게 유지
  const [acceptFix] = useState(() => new AcceptFix());

  const rememberSettingsTab = useCallback((tab: SettingsTabId) => {
    setSettingsTab(tab);
    try {
      localStorage.setItem('agent-k.settings.lastTab', tab);
    } catch {
      /* ignore */
    }
  }, []);

  /** Settings 토글 — 명시적 type=button 동반; History 닫기 */
  const handleToggleSettings = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowHistory(false);
    setShowSettings((prev) => !prev);
  }, []);

  /** Settings 닫기 — provider 탭 복원 후 model 목록 재동기화 */
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    // sessionStore는 useChatSessions 모듈에서 가져옴 (직접 import)
    const id = currentSessionIdRef.current;
    if (id) restoreProviderForSession(id);
    onSettingsClosed?.();
  }, [restoreProviderForSession, onSettingsClosed, currentSessionIdRef]);

  /** History 토글 */
  const handleToggleHistory = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowSettings(false);
    setShowHistory((prev) => !prev);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setShowHistory(false);
  }, []);

  /** Review 패널 AcceptFix — patch 적용 후 Artifacts 목록에 diff 추가 */
  const handleAcceptFinding = useCallback(
    async (id: string) => {
      const finding = reviewFindings.find((f) => f.id === id);
      if (!finding) return;
      const result = await acceptFix.accept(finding);
      if (result.applied && result.patch) {
        setArtifacts((prev) => [
          {
            id: `art-${Date.now()}`,
            type: 'diff',
            title: `Fix ${finding.file}`,
            description: finding.message,
            data: result.patch!,
            filePath: finding.file,
            timestamp: Date.now(),
            tags: ['review', 'fix']
          },
          ...prev
        ]);
      }
      setReviewFindings((prev) => prev.filter((f) => f.id !== id));
    },
    [reviewFindings, acceptFix]
  );

  return {
    showSettings,
    setShowSettings,
    settingsTab,
    rememberSettingsTab,
    handleToggleSettings,
    handleCloseSettings,
    showHistory,
    setShowHistory,
    handleToggleHistory,
    handleCloseHistory,
    showDesignMode,
    setShowDesignMode,
    showReview,
    setShowReview,
    reviewFindings,
    setReviewFindings,
    handleAcceptFinding,
    showArtifacts,
    setShowArtifacts,
    artifacts,
    setArtifacts
  };
}
