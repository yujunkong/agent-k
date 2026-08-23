/**
 * SUB-* domain barrel — task model, runner, AgentLoop executor.
 */

export {
  applySubagentPatch,
  createSubagentTask,
  isTerminalSubagentStatus,
  patchSubagentTask,
  type SubagentRole,
  type SubagentStatus,
  type SubagentTask,
  type SubagentTaskPatch,
  type SubagentWorktree,
  type SubagentWorktreeBindings,
  type SubagentWorktreeSnapshot,
} from './subagents';

export {
  SubagentRunner,
  type SubagentEvent,
  type SubagentExecutionContext,
  type SubagentExecutor,
  type SubagentRunnerOptions,
} from './subagentRunner';

export {
  createSubagentAgentLoopExecutor,
  type SubagentAgentLoopHooks,
  type SubagentAgentLoopMessage,
  type SubagentAgentLoopOptions,
} from './subagentAgentLoopExecutor';
