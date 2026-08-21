# @agent-k/providers

Provider/Model layer (R-001: Composer dropdown ≠ runtime ModelRouter).

## Feature IDs

| ID | Module | Notes |
|----|--------|-------|
| PROVIDER-001 | `detectProviderType.ts` | URL → type; unknown → OpenAI Compatible |
| PROVIDER-002 | `ProviderRegistry.ts` | register / activate / list |
| PROVIDER-003 | `ProviderConnections.ts` | connections + **custom OpenAI Compatible** |
| PROVIDER-004 | `ProviderProfiles.ts` | per-model activation profiles |
| PROVIDER-005 | `providerPresets.ts` | Add Provider presets |
| PROVIDER-006 | `providerFields.ts` | field meta; label `litellm` = OpenAI Compatible |
| PROVIDER-007 | `providerStatus.ts` | health labels |
| PROVIDER-008 | `HealthCheck.ts` | checker registry |
| PROVIDER-009 | `providerProbe.ts` | domain `/v1/models` probe (no vscode) |
| PROVIDER-010 | `LiteLLMProvider.ts` | OpenAI-compatible HTTP client |
| PROVIDER-011…014 | types + presets + fields + detect | OpenAI / Anthropic / Ollama / LM Studio |

**Skipped this session:** PROVIDER-015…018 (OpenCode Zen/Go, DGX, SecretManager, ToolResultFormatter).

## Custom OpenAI Compatible

```ts
import { addCustomOpenAICompatibleConnection } from '@agent-k/providers';

addCustomOpenAICompatibleConnection({
  name: 'My vLLM',
  baseUrl: 'http://10.0.0.5:8000',
  apiKey: 'optional',
});
```

Type is always `litellm` (UI label **OpenAI Compatible**) unless `autoDetectType: true`.

## Commands

```bash
# Unit tests
npm run test -w @agent-k/providers

# Typecheck
npm run typecheck -w @agent-k/providers

# Runnable smoke (mock OpenAI Compatible /v1/models → detect → connect → probe)
npm run smoke -w @agent-k/providers
```

Host owns vscode `fetch` / postMessage for UXPROV-001; inject `setProviderConfigStore` when CFG lands.
