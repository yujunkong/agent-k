/** Temporary webview stub (UI port). Host owns real impl. */
/** Webview stub — SkillRegistry lives on host. */
export function getSkillRegistry() {
  return { list: () => [], get: () => undefined };
}
