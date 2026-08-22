/** SET-002 — model settings shape + config.hydrate mapping. */

export type ModelSettings = {
  model: string;
  baseUrl: string;
  apiKey: string;
};

/** Read provider fields from host `config.hydrate` values map. */
export function modelSettingsFromConfig(values: Record<string, unknown>): ModelSettings {
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const v = values[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  return {
    model: pick('agent-k.provider.model', 'provider.model'),
    baseUrl: pick('agent-k.provider.baseUrl', 'provider.baseUrl'),
    apiKey: pick('agent-k.provider.apiKey', 'provider.apiKey'),
  };
}
