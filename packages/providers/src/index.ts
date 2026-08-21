/**
 * @agent-k/providers — Provider/Model layer (R-001: Composer ≠ ModelRouter).
 *
 * Feature IDs (this transplant):
 * - PROVIDER-001 detectProviderType
 * - PROVIDER-002 ProviderRegistry
 * - PROVIDER-003 ProviderConnections (+ custom OpenAI Compatible)
 * - PROVIDER-004 ProviderProfiles
 * - PROVIDER-005 providerPresets
 * - PROVIDER-006 providerFields
 * - PROVIDER-007 providerStatus
 * - PROVIDER-008 HealthCheck
 * - PROVIDER-009 providerProbe (domain; host keeps vscode bridge)
 * - PROVIDER-010 LiteLLMProvider (OpenAI Compatible wire client)
 * - PROVIDER-011 OpenAI (type + preset + fields)
 * - PROVIDER-012 Anthropic (type + preset + fields)
 * - PROVIDER-013 Ollama (type + detect + fields)
 * - PROVIDER-014 LM Studio (type + detect + fields)
 *
 * Skipped: PROVIDER-015…018 (OpenCode / DGX / SecretManager / ToolResultFormatter).
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
