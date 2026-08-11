/**
 * Debug write gate — hard block product edits until Confirm & Fix (fix/cleanup).
 * Research tools (read / ask / instrument / reproduce / logs / terminal / MCP)
 * stay available across pre-fix stages; accuracy is soft-prompted, not schema-hidden.
 */

/** Same stages as DebugModeController.DebugStage (kept local to avoid circular imports). */
type DebugStage =
  | 'hypothesis'
  | 'instrument'
  | 'reproduce'
  | 'analyze'
  | 'fix'
  | 'cleanup';

/** Real product edits — blocked until fix stage (Confirm & Fix). */
export const DEBUG_PRODUCT_WRITE_TOOLS = new Set([
  'edit_file',
  'write_file',
  'delete_file',
]);

const PRE_FIX_STAGES: ReadonlySet<DebugStage> = new Set([
  'hypothesis',
  'instrument',
  'reproduce',
  'analyze',
]);

export function isDebugPreFixStage(stage: DebugStage): boolean {
  return PRE_FIX_STAGES.has(stage);
}

/**
 * Stage gate for Debug mode tools.
 * Mode whitelist still applies separately via modeRegistry.
 */
export function debugWriteGate(
  stage: DebugStage,
  toolName: string
): { allowed: boolean; error?: string } {
  if (toolName === 'remove_instrumentation') {
    if (stage === 'fix' || stage === 'cleanup') {
      return { allowed: true };
    }
    return {
      allowed: false,
      error:
        `[Debug Mode] remove_instrumentation is only allowed in fix/cleanup. ` +
        `Current stage: "${stage}". Finish Confirm & Fix first, then clean markers.`,
    };
  }

  if (DEBUG_PRODUCT_WRITE_TOOLS.has(toolName) && isDebugPreFixStage(stage)) {
    return {
      allowed: false,
      error:
        `[Debug Mode] Tool "${toolName}" is blocked until the user clicks Confirm & Fix. ` +
        `Current stage: "${stage}". Use research/instrument tools; do not apply the real fix yet.`,
    };
  }

  return { allowed: true };
}

/** Compatibility helper used by loop schema filter + execute deny. */
export function isDebugToolAllowedForStage(
  stage: DebugStage,
  toolName: string
): boolean {
  return debugWriteGate(stage, toolName).allowed;
}
