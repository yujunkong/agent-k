/**
 * Alias wrappers so v2.1 / harness names resolve to registered executors.
 */

import type { ToolDefinition } from '../types';

/** Clone a tool under a new schema name (shared execute). */
export function aliasTool(
  base: ToolDefinition,
  name: string,
  description?: string
): ToolDefinition {
  return {
    ...base,
    name,
    description: description ?? base.description,
    execute: (input, ctx) => base.execute(input, ctx),
  };
}
