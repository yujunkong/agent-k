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
| MODEL-001 | `ModelRegistry.ts` | unified catalog across connections |
| MODEL-002 | `ModelResolver.ts` | local-first resolve + activate |
| MODEL-003 | `ModelRouter.ts` + `ModelRouting.ts` | tier route ≠ role→profile routing |
| MODEL-004 | `normalizeModelId.ts` | canonicalize / display / match |
| MODEL-005 | `modelTags.ts` | local/fast/cheap/reasoning/vision |
| MODEL-006/007 | `availableModels.ts` | discovery + composer persistence |
| MODEL-008 | `thinkingEffort.ts` | capability + effort clamp / wire opts |
| MODEL-009 | `ModelTiers.ts` | A/B/C **maxTurns** policies |
| MODEL-010 | `ProviderConnections` preferUserOrder | drag order |
| MODEL-011 | `modelContextInfo.ts` | context window resolve (inject fetch) |
| CFG-008 | `providerConfig.ts` | type / URL / model / keys / connections |
| UXPROV-001 | `testProviderConnection` | connection test (inject fetch) |
| UXPROV-002 | `refreshAvailableModels` | probe → catalog refresh |
| UXPROV-003 | `modelPicker.ts` | searchable filter helpers (no React) |
| UXPROV-004 | `ProviderConnections` | saved connections |

**UXPROV-005 / UXPROV-006 (domain):** provider order = `reorderProviderConnections` + `preferUserOrder` (MODEL-010); local-first resolve = `ModelResolver` (MODEL-002). Chat-ui picker wiring → Phase 3 CHAT-003.

**Skipped this session:** PROVIDER-015…018.

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

## Model layer (R-001)

```ts
import {
  listUnifiedModels,
  resolveAndActivateModel,
  ModelRouter,
  filterModelOptions,
  refreshAvailableModels,
} from '@agent-k/providers';

// Composer: unified list + filter (not ModelRouter)
const options = listUnifiedModels();
filterModelOptions(options.map((m) => m.canonicalId), { query: 'qwen' });

// Runtime: resolver activates connection; router picks tier for agent loop
resolveAndActivateModel('qwen3-coder');
new ModelRouter().route({ taskType: 'plan', complexity: 'complex' });
```

Host injects `setProviderConfigStore` and CSP-safe `fetchImpl` for probe/refresh.

## Commands

```bash
# Unit tests
npm run test -w @agent-k/providers

# Typecheck
npm run typecheck -w @agent-k/providers

# Runnable smoke (mock OpenAI Compatible /v1/models → detect → connect → probe)
npm run smoke -w @agent-k/providers
```
