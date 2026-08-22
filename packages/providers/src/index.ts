/**
 * @agent-k/providers — Provider/Model layer (R-001: Composer ≠ ModelRouter).
 *
 * Feature IDs (this transplant):
 * - PROVIDER-001…014 (prior)
 * - MODEL-001 ModelRegistry
 * - MODEL-002 ModelResolver (UXPROV-006 local-first)
 * - MODEL-003 ModelRouter + ModelRouting
 * - MODEL-004 normalizeModelId
 * - MODEL-005 modelTags
 * - MODEL-006 / 007 availableModels + persistSelectedModel
 * - MODEL-008 thinkingEffort capability
 * - MODEL-009 ModelTiers (maxTurns)
 * - MODEL-010 preferUserOrder (ProviderConnections)
 * - MODEL-011 modelContextInfo
 * - CFG-008 providerConfig keys / snapshot
 * - UXPROV-001 testProviderConnection
 * - UXPROV-002 refreshAvailableModels
 * - UXPROV-003 modelPicker filter helpers
 * - UXPROV-004 saved connections (ProviderConnections)
 * - UXPROV-005 provider order (`reorderProviderConnections` + preferUserOrder / MODEL-010)
 * - UXPROV-006 local-first auto resolve (`ModelResolver` / MODEL-002)
 *
 * Skipped: PROVIDER-015…018. UXPROV-003/005/006 chat-ui picker → CHAT-003 (ModelSelector).
 */

export * from './types';
export * from './configStore';
export * from './detectProviderType';
export * from './normalizeModelId';
export * from './thinkingEffort';
export * from './providerPresets';
export * from './providerFields';
export * from './providerStatus';
export * from './HealthCheck';
export * from './LiteLLMProvider';
export * from './ProviderRegistry';
export * from './ProviderProfiles';
export * from './ProviderConnections';
export * from './providerProbe';
export * from './modelTags';
export * from './ModelRegistry';
export * from './ModelResolver';
export * from './ModelRouter';
export * from './ModelRouting';
export * from './ModelTiers';
export * from './availableModels';
export * from './modelPicker';
export * from './modelContextInfo';
export * from './providerConfig';
