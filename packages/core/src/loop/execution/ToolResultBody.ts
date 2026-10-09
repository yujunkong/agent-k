/**
 * V31-TOOL-08 — deterministic tool-result body formatting.
 * The loop transcript carries a JSON body for structured `data` and an
 * "Error: ..." body for failures. Extracted from the controller so the shape
 * is single-sourced and testable.
 */

export interface ToolResultBodyInput {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Optional cap; when exceeded the body is truncated (opt-in, default off). */
  maxChars?: number;
}

export interface ToolResultBody {
  body: string;
  truncated: boolean;
}

/** Build the tool message body the model reads from a tool result. */
export function formatToolResultBody(input: ToolResultBodyInput): ToolResultBody {
  let body: string;
  if (input.success) {
    body =
      typeof input.data === 'string'
        ? input.data
        : JSON.stringify(input.data ?? null);
  } else {
    body = `Error: ${input.error ?? 'tool failed'}`;
  }

  const cap = input.maxChars;
  if (cap != null && cap >= 0 && body.length > cap) {
    return { body: body.slice(0, cap), truncated: true };
  }
  return { body, truncated: false };
}
