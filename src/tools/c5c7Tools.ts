/**
 * C5-C7 도구 등록 — Plan/Debug/browser/MCP/orchestration
 *
 * registerC5C7Tools()를 extension.activate에서 호출해야 합니다.
 * 각 도구는 modeAllowlist 기반 모드별 가시성을 가집니다.
 */
import type { ToolDefinition } from '../agent/types';
import { toolRegistry } from './registry';

// ─── switch_mode ─────────────────────────────────────────
const switchModeTool: ToolDefinition = {
  name: 'switch_mode',
  description: 'Switch the current mode. Changes the active agent mode for subsequent conversations.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['ask', 'agent', 'plan', 'debug'],
        description: 'Target mode to switch to'
      },
      reason: {
        type: 'string',
        description: 'Reason for switching mode (optional)',
        optional: true
      }
    },
    required: ['mode']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'session'
};

// ─── checkpoint 도구 ─────────────────────────────────────
const checkpointCreateTool: ToolDefinition = {
  name: 'checkpoint_create',
  description: 'Create a workspace checkpoint/snapshot before making potentially destructive changes.',
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Checkpoint label for identification', optional: true }
    },
    required: []
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'edit'
};

const checkpointRestoreTool: ToolDefinition = {
  name: 'checkpoint_restore',
  description: 'Restore workspace to a previous checkpoint.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Checkpoint ID to restore (optional — lists available if omitted)', optional: true }
    },
    required: []
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'edit'
};

// ─── Debug instrumentation 도구 ──────────────────────────
const addInstrumentationTool: ToolDefinition = {
  name: 'add_instrumentation',
  description: 'Add DEBUG_INSTRUMENT markers to code for runtime data collection during debugging.',
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'File path to instrument' },
      hypothesisId: { type: 'string', description: 'Hypothesis ID for grouping instrumentation' },
      type: { type: 'string', enum: ['entry', 'exit', 'conditional', 'dump'], description: 'Instrumentation type' },
      lineNumber: { type: 'number', description: 'Line number to insert after', optional: true },
      variableName: { type: 'string', description: 'Variable to log', optional: true },
      condition: { type: 'string', description: 'Condition for conditional instrumentation', optional: true }
    },
    required: ['filePath', 'hypothesisId', 'type']
  },
  modeAllowlist: ['debug'],
  category: 'debug'
};

const removeInstrumentationTool: ToolDefinition = {
  name: 'remove_instrumentation',
  description: 'Remove DEBUG_INSTRUMENT markers from code after debugging is complete.',
  parameters: {
    type: 'object',
    properties: {
      hypothesisId: { type: 'string', description: 'Hypothesis ID to clean up (optional — all if omitted)', optional: true },
      filePath: { type: 'string', description: 'Specific file to clean (optional)', optional: true }
    },
    required: []
  },
  modeAllowlist: ['debug'],
  category: 'debug'
};

const collectRuntimeLogsTool: ToolDefinition = {
  name: 'collect_runtime_logs',
  description: 'Collect runtime logs from instrumented code or terminal output for analysis.',
  parameters: {
    type: 'object',
    properties: {
      hypothesisId: { type: 'string', description: 'Filter logs by hypothesis ID', optional: true },
      sessionId: { type: 'string', description: 'Terminal session ID', optional: true },
      since: { type: 'number', description: 'Unix timestamp to collect logs since', optional: true }
    },
    required: []
  },
  modeAllowlist: ['debug'],
  category: 'debug'
};

const requestReproduceTool: ToolDefinition = {
  name: 'request_reproduce',
  description: 'Ask the user to reproduce a bug or run a specific action to gather evidence.',
  parameters: {
    type: 'object',
    properties: {
      steps: { type: 'string', description: 'Steps the user should follow to reproduce' },
      hypothesisId: { type: 'string', description: 'Related hypothesis ID', optional: true },
      whatToLookFor: { type: 'string', description: 'What to observe during reproduction', optional: true }
    },
    required: ['steps']
  },
  modeAllowlist: ['debug'],
  category: 'debug'
};

// ─── Browser 도구 ────────────────────────────────────────
const browserNavigateTool: ToolDefinition = {
  name: 'browser_navigate',
  description: 'Navigate browser to a URL. Requires an active browser session.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      url: { type: 'string', description: 'Target URL to navigate to' },
      waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'Wait condition', optional: true }
    },
    required: ['sessionId', 'url']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserClickTool: ToolDefinition = {
  name: 'browser_click',
  description: 'Click an element by CSS selector in the browser.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector to click' },
      timeout: { type: 'number', description: 'Timeout in ms', optional: true }
    },
    required: ['sessionId', 'selector']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserScreenshotTool: ToolDefinition = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current browser page or a specific element.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector (optional, defaults to viewport)', optional: true },
      fullPage: { type: 'boolean', description: 'Capture full page (optional)', optional: true }
    },
    required: ['sessionId']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserEvaluateTool: ToolDefinition = {
  name: 'browser_evaluate',
  description: 'Execute JavaScript code in the browser page context.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      script: { type: 'string', description: 'JavaScript code to execute' }
    },
    required: ['sessionId', 'script']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserConsoleTool: ToolDefinition = {
  name: 'browser_console',
  description: 'Retrieve captured browser console logs.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      clear: { type: 'boolean', description: 'Clear logs after retrieval', optional: true }
    },
    required: ['sessionId']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserNetworkTool: ToolDefinition = {
  name: 'browser_network',
  description: 'Retrieve captured browser network request logs.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      clear: { type: 'boolean', description: 'Clear logs after retrieval', optional: true }
    },
    required: ['sessionId']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserScrollTool: ToolDefinition = {
  name: 'browser_scroll',
  description: 'Scroll the browser page or a specific element.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector (optional, defaults to window)', optional: true },
      x: { type: 'number', description: 'Horizontal scroll amount', optional: true },
      y: { type: 'number', description: 'Vertical scroll amount', optional: true }
    },
    required: ['sessionId']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

const browserWaitTool: ToolDefinition = {
  name: 'browser_wait',
  description: 'Wait for a selector or condition in the browser.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Browser session ID' },
      selector: { type: 'string', description: 'CSS selector to wait for', optional: true },
      timeout: { type: 'number', description: 'Timeout in ms', optional: true },
      state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'], description: 'Expected state', optional: true }
    },
    required: ['sessionId']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'web'
};

// ─── Orchestration 도구 ──────────────────────────────────
const taskRunTool: ToolDefinition = {
  name: 'task_run',
  description: 'Spawn a sub-agent to work on a task autonomously. The sub-agent completes the task and returns results.',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Task description for the sub-agent' },
      subtasks: { type: 'array', items: { type: 'string' }, description: 'Subtasks to complete', optional: true },
      mode: { type: 'string', enum: ['agent', 'ask', 'plan', 'debug'], description: 'Mode for the sub-agent (default: agent)', optional: true }
    },
    required: ['description']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'orchestration'
};

const skillRunTool: ToolDefinition = {
  name: 'skill_run',
  description: 'Run a registered skill. Skills provide specialized instructions for specific tasks.',
  parameters: {
    type: 'object',
    properties: {
      skill: { type: 'string', description: 'Skill name to execute' },
      input: { type: 'string', description: 'Input for the skill', optional: true }
    },
    required: ['skill']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'orchestration'
};

// ─── MCP 도구 ───────────────────────────────────────────
const mcpCallTool: ToolDefinition = {
  name: 'mcp_call_tool',
  description: 'Call a tool exposed by an MCP (Model Context Protocol) server.',
  parameters: {
    type: 'object',
    properties: {
      serverName: { type: 'string', description: 'MCP server name' },
      toolName: { type: 'string', description: 'Tool name on the MCP server' },
      arguments: { type: 'object', description: 'Tool arguments', optional: true }
    },
    required: ['serverName', 'toolName']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'orchestration'
};

const mcpListToolsTool: ToolDefinition = {
  name: 'mcp_list_tools',
  description: 'List available tools on an MCP server.',
  parameters: {
    type: 'object',
    properties: {
      serverName: { type: 'string', description: 'MCP server name (optional — lists all servers if omitted)', optional: true }
    },
    required: []
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'orchestration'
};

// ─── Register all C5-C7 tools ───────────────────────────
export function registerC5C7Tools(): void {
  // Mode switching
  toolRegistry.registerTool(switchModeTool);

  // Checkpoint
  toolRegistry.registerTool(checkpointCreateTool);
  toolRegistry.registerTool(checkpointRestoreTool);

  // Debug instrumentation
  toolRegistry.registerTool(addInstrumentationTool);
  toolRegistry.registerTool(removeInstrumentationTool);
  toolRegistry.registerTool(collectRuntimeLogsTool);
  toolRegistry.registerTool(requestReproduceTool);

  // Browser
  toolRegistry.registerTool(browserNavigateTool);
  toolRegistry.registerTool(browserClickTool);
  toolRegistry.registerTool(browserScreenshotTool);
  toolRegistry.registerTool(browserEvaluateTool);
  toolRegistry.registerTool(browserConsoleTool);
  toolRegistry.registerTool(browserNetworkTool);
  toolRegistry.registerTool(browserScrollTool);
  toolRegistry.registerTool(browserWaitTool);

  // Orchestration
  toolRegistry.registerTool(taskRunTool);
  toolRegistry.registerTool(skillRunTool);

  // MCP
  toolRegistry.registerTool(mcpCallTool);
  toolRegistry.registerTool(mcpListToolsTool);
}
