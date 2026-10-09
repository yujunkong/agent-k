/**
 * V31-TOOL-05 — Tier A task-intent tool availability tests (ISSUE-05).
 */

import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './ToolRegistry';
import { registerBuiltinTools } from './registerBuiltinTools';

function names(
  registry: ToolRegistry,
  opts?: Parameters<ToolRegistry['getSchemas']>[1],
) {
  return registry.getSchemas('agent', opts).map((s) => s.function.name);
}

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  // Fake MCP tool to exercise the `mcp_` prefix rule.
  registry.register({
    name: 'mcp_foo_bar',
    description: 'fake mcp tool',
    inputSchema: { type: 'object', properties: {} },
    permissionHint: 'network',
    timeoutMs: 1_000,
    cancelSupported: false,
    timelineEventType: 'tool',
    modeAllowlist: ['agent'],
    category: 'web',
    execute: async () => ({ success: true }),
  });
  return registry;
}

const TASK_TOOLS = ['web_search', 'task_run', 'browser_navigate', 'mcp_foo_bar'];

describe('V31-TOOL-05 Tier A task-intent tools', () => {
  it('tier A + intentKind task exposes task/web/MCP/browser tools', () => {
    const registry = makeRegistry();
    const visible = names(registry, {
      modelTier: 'A',
      harnessEnabled: true,
      intentKind: 'task',
    });
    for (const tool of TASK_TOOLS) {
      expect(visible).toContain(tool);
    }
  });

  it('tier A + intentKind question hides task/web/MCP/browser tools', () => {
    const registry = makeRegistry();
    const visible = names(registry, {
      modelTier: 'A',
      harnessEnabled: true,
      intentKind: 'question',
    });
    for (const tool of TASK_TOOLS) {
      expect(visible).not.toContain(tool);
    }
  });

  it('tier A + undefined intent keeps current behavior (hidden)', () => {
    const registry = makeRegistry();
    const visible = names(registry, {
      modelTier: 'A',
      harnessEnabled: true,
    });
    for (const tool of TASK_TOOLS) {
      expect(visible).not.toContain(tool);
    }
  });

  it('tier B exposes task/web/MCP/browser tools', () => {
    const registry = makeRegistry();
    const visible = names(registry, {
      modelTier: 'B',
      harnessEnabled: true,
    });
    for (const tool of TASK_TOOLS) {
      expect(visible).toContain(tool);
    }
  });

  it('tier A + task still exposes read_file', () => {
    const registry = makeRegistry();
    const visible = names(registry, {
      modelTier: 'A',
      harnessEnabled: true,
      intentKind: 'task',
    });
    expect(visible).toContain('read_file');
    expect(visible).toContain('grep');
  });
});
