/**
 * useChatProvider — Provider / Model 상태 관리
 *
 * 담당:
 *   - providerModel / baseUrl / apiKey / type / thinkingEffort 상태
 *   - composerModels, modelContextBudget, modelContextSource
 *   - persistProviderToSession / parkProvider / restoreProvider
 *   - handleModelChange / handleThinkingEffortChange
 *   - requestModelContext (host 에 model.context.refresh 전송)
 *   - Composer 옵션 계산 (composerModelOptions, composerThinkingOptions, modelLabel)
 *
 * setProviderConfigStore 는 모듈 진입 시점에 ChatApp.tsx에서 한 번만 호출됨 — 여기서는 호출 안 함.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { configManager } from '../../core/ConfigManager';
import { sessionStore } from '../hooks/useChatSessions';
import type { ChatSession } from '../ChatSessionStore';
import {
  getComposerModels,
  getUnifiedComposerModels,
  refreshComposerModels
} from '../providerModels';
import { resolveSendCredentials } from '../resolveSendCredentials';
import {
  clampThinkingEffort,
  parseThinkingEffort,
  resolveThinkingCapability,
  thinkingOptionsForModel,
  type ThinkingEffort
} from '../../agent/thinkingEffort';
import { normalizeModelId } from '../../providers/normalizeModelId';
import { getActiveProviderName } from '../../providers/ModelResolver';
import { unifiedModelsToPickerOptions } from '../../providers/modelPicker';
import { shortModelName } from '../chatAppHelpers';
import { getVsCodeApi } from '../host/vscodeApi';
import { modeRegistry } from '../../agent/modeRegistry';
import type { Mode } from '../types';

export interface UseChatProviderReturn {
  providerModel: string;
  setProviderModel: (v: string) => void;
  providerBaseUrl: string;
  setProviderBaseUrl: (v: string) => void;
  providerApiKey: string;
  setProviderApiKey: (v: string) => void;
  providerType: string;
  setProviderType: (v: string) => void;
  composerModels: string[];
  setComposerModels: (v: string[]) => void;
  modelContextBudget: number;
  setModelContextBudget: (v: number) => void;
  modelContextSource: string;
  setModelContextSource: (v: string) => void;
  thinkingEffort: ThinkingEffort;
  setThinkingEffort: (v: ThinkingEffort) => void;
  /** ref들 — stale closure 없이 값 스냅샷 가능 */
  providerModelRef: React.MutableRefObject<string>;
  providerBaseUrlRef: React.MutableRefObject<string>;
  providerApiKeyRef: React.MutableRefObject<string>;
  providerTypeRef: React.MutableRefObject<string>;
  thinkingEffortRef: React.MutableRefObject<ThinkingEffort>;
  isRestoringProviderRef: React.MutableRefObject<boolean>;
  /** 세션에 provider 설정 저장 */
  persistProviderToSession: (id: string, patch?: Partial<NonNullable<ChatSession['provider']>>) => void;
  parkProviderForSession: (id: string) => void;
  restoreProviderForSession: (id: string) => void;
  handleModelChange: (next: string) => void;
  handleThinkingEffortChange: (next: ThinkingEffort) => void;
  requestModelContext: () => void;
  /** Composer 모델 picker 옵션 */
  composerModelOptions: ReturnType<typeof unifiedModelsToPickerOptions> | string[];
  composerThinkingOptions: ReturnType<typeof thinkingOptionsForModel>;
  /** 표시용 모델 레이블 (providerName 포함) */
  modelLabel: string;
  modelCanonical: string;
  /** context budget & usage (mode 의존 — ChatApp에서 uxState.contextTokens 를 같이 사용) */
  getContextBudget: (mode: Mode) => number;
}

export function useChatProvider(): UseChatProviderReturn {
  const [providerModel, setProviderModel] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.model;
    return String(fromSession || configManager.get('agent-k.provider.model') || '');
  });
  const [providerBaseUrl, setProviderBaseUrl] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.baseUrl;
    return String(fromSession || configManager.get('agent-k.provider.baseUrl') || '');
  });
  const [providerApiKey, setProviderApiKey] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.apiKey;
    return String(fromSession ?? configManager.get('agent-k.provider.apiKey') ?? '');
  });
  const [providerType, setProviderType] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.type;
    return String(fromSession || configManager.get('agent-k.provider.type') || 'litellm');
  });
  const [composerModels, setComposerModels] = useState<string[]>(() => getComposerModels());
  const [modelContextBudget, setModelContextBudget] = useState<number>(() =>
    Number(configManager.get('agent-k.context.budget')) || 100000
  );
  const [modelContextSource, setModelContextSource] = useState<string>('fallback');
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(() => {
    const fromSession = sessionStore.loadActive().provider?.thinkingEffort;
    return parseThinkingEffort(
      fromSession ?? configManager.get('agent-k.thinking.effort')
    );
  });

  // stale closure 방지용 refs
  const providerModelRef = useRef(providerModel);
  const providerBaseUrlRef = useRef(providerBaseUrl);
  const providerApiKeyRef = useRef(providerApiKey);
  const providerTypeRef = useRef(providerType);
  const thinkingEffortRef = useRef(thinkingEffort);
  providerModelRef.current = providerModel;
  providerBaseUrlRef.current = providerBaseUrl;
  providerApiKeyRef.current = providerApiKey;
  providerTypeRef.current = providerType;
  thinkingEffortRef.current = thinkingEffort;

  /** Settings 복원 중 tab-switch 시 전역 config 덮어쓰기 방지 */
  const isRestoringProviderRef = useRef(false);

  /** Composer provider 필드를 세션 store에 저장 (tab-scoped) */
  const persistProviderToSession = useCallback(
    (id: string, patch?: Partial<NonNullable<ChatSession['provider']>>) => {
      if (!id) return;
      sessionStore.setProvider(id, {
        model: providerModelRef.current,
        thinkingEffort: thinkingEffortRef.current,
        type: providerTypeRef.current,
        baseUrl: providerBaseUrlRef.current,
        apiKey: providerApiKeyRef.current,
        ...patch
      });
    },
    []
  );

  // configManager 변경 → React state 동기화 + session write-through
  useEffect(() => {
    const syncModels = () => setComposerModels(getComposerModels());
    const writeThroughCurrent = (patch: Partial<NonNullable<ChatSession['provider']>>) => {
      const id = sessionStore.getCurrentId();
      if (id) persistProviderToSession(id, patch);
    };
    const unsubs = [
      configManager.on('agent-k.provider.model', (_k, v) => {
        if (isRestoringProviderRef.current) return;
        const model = String(v || '');
        setProviderModel(model);
        syncModels();
        writeThroughCurrent({ model });
      }),
      configManager.on('agent-k.provider.baseUrl', (_k, v) => {
        if (isRestoringProviderRef.current) return;
        const baseUrl = String(v || '');
        setProviderBaseUrl(baseUrl);
        writeThroughCurrent({ baseUrl });
      }),
      configManager.on('agent-k.provider.apiKey', (_k, v) => {
        if (isRestoringProviderRef.current) return;
        const apiKey = String(v || '');
        setProviderApiKey(apiKey);
        writeThroughCurrent({ apiKey });
      }),
      configManager.on('agent-k.provider.availableModels', syncModels),
      configManager.on('agent-k.provider.models', syncModels),
      configManager.on('agent-k.thinking.effort', (_k, v) => {
        if (isRestoringProviderRef.current) return;
        const effort = parseThinkingEffort(v);
        setThinkingEffort(effort);
        writeThroughCurrent({ thinkingEffort: effort });
      }),
      configManager.on('agent-k.provider.type', (_k, v) => {
        if (isRestoringProviderRef.current) return;
        const type = String(v || 'litellm');
        setProviderType(type);
        writeThroughCurrent({ type });
      }),
      configManager.on('agent-k.context.budget', (_k, v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) setModelContextBudget(n);
      }),
    ];
    syncModels();
    return () => unsubs.forEach((u) => u());
  }, [persistProviderToSession]);

  /** provider baseUrl 변경 → /v1/models 재조회 */
  useEffect(() => {
    let cancelled = false;
    const base = providerBaseUrl.replace(/\/$/, '');
    if (!base) return;
    void (async () => {
      const result = await refreshComposerModels({
        baseUrl: base,
        apiKey: providerApiKey || undefined,
        model: providerModel,
        providerType:
          providerType || String(configManager.get('agent-k.provider.type') || '')
      });
      if (cancelled) return;
      if (result.ok) {
        setComposerModels(getComposerModels());
        // Do not stomp tab-scoped model with global config after /v1/models refresh.
      }
    })();
    return () => { cancelled = true; };
  }, [providerBaseUrl, providerApiKey, providerType]);

  /** 탭 전환 시 provider 설정 보존 */
  const parkProviderForSession = useCallback(
    (id: string) => {
      if (!id) return;
      persistProviderToSession(id);
    },
    [persistProviderToSession]
  );

  /**
   * 탭 전환 시 session store에서 provider 복원.
   * 신규/빈 탭: 현재 Composer 값을 스탬프 (전역 config 덮어쓰기 방지).
   */
  const restoreProviderForSession = useCallback(
    (id: string) => {
      isRestoringProviderRef.current = true;
      const p = sessionStore.get(id)?.provider;
      if (!p?.model && !p?.thinkingEffort && !p?.baseUrl && !p?.type) {
        persistProviderToSession(id);
        isRestoringProviderRef.current = false;
        return;
      }
      setProviderModel(String(p?.model || configManager.get('agent-k.provider.model') || ''));
      setProviderBaseUrl(
        String(p?.baseUrl || configManager.get('agent-k.provider.baseUrl') || '')
      );
      setProviderApiKey(
        String(p?.apiKey ?? configManager.get('agent-k.provider.apiKey') ?? '')
      );
      setProviderType(
        String(p?.type || configManager.get('agent-k.provider.type') || 'litellm')
      );
      setThinkingEffort(
        parseThinkingEffort(
          p?.thinkingEffort ?? configManager.get('agent-k.thinking.effort')
        )
      );
      // React 상태가 적용된 후 flag 해제 (전역 config thrash 방지)
      queueMicrotask(() => {
        isRestoringProviderRef.current = false;
      });
    },
    [persistProviderToSession]
  );

  /**
   * Composer 모델 변경 → resolve connection into React + tab session.
   * Must fill baseUrl/apiKey or chat.send fails with a silent frozen turn.
   * Prefer connection/profile resolve; activate only as last resort inside
   * resolveSendCredentials (avoids stomping other tabs via config listeners).
   */
  const handleModelChange = useCallback((next: string) => {
    if (!next) return;
    const creds = resolveSendCredentials({
      model: next,
      baseUrl: providerBaseUrlRef.current,
      apiKey: providerApiKeyRef.current,
      type: providerTypeRef.current
    });
    const model = creds.model || next;
    setProviderModel(model);
    setProviderType(creds.type);
    setProviderBaseUrl(creds.baseUrl);
    setProviderApiKey(creds.apiKey);
    // Keep refs hot for an immediate send before React re-renders.
    providerModelRef.current = model;
    providerTypeRef.current = creds.type;
    providerBaseUrlRef.current = creds.baseUrl;
    providerApiKeyRef.current = creds.apiKey;
    persistProviderToSession(sessionStore.getCurrentId() || '', {
      model,
      type: creds.type,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey
    });
  }, [persistProviderToSession]);

  /** Thinking effort 변경 → tab session only */
  const handleThinkingEffortChange = useCallback((next: ThinkingEffort) => {
    const capped = clampThinkingEffort(next, resolveThinkingCapability(providerModel));
    setThinkingEffort(capped);
    persistProviderToSession(sessionStore.getCurrentId() || '', { thinkingEffort: capped });
  }, [providerModel, persistProviderToSession]);

  // 모델 변경 시 thinking effort를 모델이 지원하는 범위로 clamp (session only)
  useEffect(() => {
    if (isRestoringProviderRef.current) return;
    const cap = resolveThinkingCapability(providerModel);
    setThinkingEffort((prev) => {
      const next = clampThinkingEffort(prev, cap);
      if (next !== prev) {
        const id = sessionStore.getCurrentId();
        if (id) persistProviderToSession(id, { thinkingEffort: next });
      }
      return next;
    });
  }, [providerModel, persistProviderToSession]);

  /** host에 model context budget 갱신 요청 */
  const requestModelContext = useCallback(() => {
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({
        type: 'model.context.refresh',
        providerType:
          providerType || String(configManager.get('agent-k.provider.type') || 'litellm'),
        baseUrl: providerBaseUrl,
        apiKey: providerApiKey || undefined,
        model: providerModel
      });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, [providerType, providerBaseUrl, providerApiKey, providerModel]);

  useEffect(() => {
    requestModelContext();
  }, [requestModelContext]);

  // Composer 모델 옵션 계산
  const unifiedModels = useMemo(() => getUnifiedComposerModels(), [composerModels]);
  const activeProviderName = getActiveProviderName();
  const modelCanonical = normalizeModelId(providerModel) || providerModel;
  const unifiedCurrent = unifiedModels.find((m) => m.canonicalId === modelCanonical);
  const modelLabel = unifiedCurrent
    ? `${unifiedCurrent.displayName}${activeProviderName ? ` · ${activeProviderName}` : ''}`
    : shortModelName(providerModel);

  const composerModelOptions = useMemo(() => {
    const fromUnified = unifiedModelsToPickerOptions();
    if (fromUnified.length > 0) {
      return fromUnified.map((m) =>
        m.id === modelCanonical && activeProviderName
          ? { ...m, providerName: activeProviderName }
          : m
      );
    }
    const ids = [...composerModels];
    if (providerModel && !ids.includes(providerModel)) ids.unshift(providerModel);
    return ids;
  }, [composerModels, providerModel, unifiedModels, activeProviderName, modelCanonical]);

  const composerThinkingOptions = useMemo(
    () => thinkingOptionsForModel(providerModel),
    [providerModel]
  );

  const getContextBudget = useCallback(
    (mode: Mode) =>
      modelContextBudget || modeRegistry.getModeConfig(mode).contextBudget || 100000,
    [modelContextBudget]
  );

  return {
    providerModel,
    setProviderModel,
    providerBaseUrl,
    setProviderBaseUrl,
    providerApiKey,
    setProviderApiKey,
    providerType,
    setProviderType,
    composerModels,
    setComposerModels,
    modelContextBudget,
    setModelContextBudget,
    modelContextSource,
    setModelContextSource,
    thinkingEffort,
    setThinkingEffort,
    providerModelRef,
    providerBaseUrlRef,
    providerApiKeyRef,
    providerTypeRef,
    thinkingEffortRef,
    isRestoringProviderRef,
    persistProviderToSession,
    parkProviderForSession,
    restoreProviderForSession,
    handleModelChange,
    handleThinkingEffortChange,
    requestModelContext,
    composerModelOptions,
    composerThinkingOptions,
    modelLabel,
    modelCanonical,
    getContextBudget
  };
}
