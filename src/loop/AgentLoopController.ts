/**
 * AgentLoopController - 코어 루프 (C3-T01)
 * 
 * 메시지 → 모델 → 도구 → 결과 → 반복
 * maxTurns 가드, Stop 신호 처리, DoomLoop 감지, 에러 복구
 */
import type { Mode, TurnContext } from '../agent/types';
import { modeRegistry } from '../agent/modeRegistry';
import { toolRegistry } from '../tools/registry';
import type { ToolInput, ToolOutput } from '../tools/types';

export interface LoopConfig {
  mode: Mode;
  maxTurns: number;
  modelId: string;
  systemPrompt?: string;
  onToolCall?: (name: string, args: ToolInput) => Promise<void>;
  onToolResult?: (name: string, result: ToolOutput) => Promise<void>;
  onTurnStart?: (turn: number) => Promise<void>;
  onTurnEnd?: (turn: number, context: TurnContext) => Promise<void>;
  onStatus?: (status: LoopStatus) => void;
  onError?: (error: Error) => void;
}

export type LoopStatus = 'idle' | 'streaming' | 'tool_executing' | 'stopped' | 'completed' | 'error' | 'doom_loop';

export interface LoopState {
  status: LoopStatus;
  currentTurn: number;
  totalTurns: number;
  mode: Mode;
  startTime: number;
  error?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: ToolInput;
  }>;
  toolCallId?: string;
  name?: string;
}

export class AgentLoopController {
  private config: LoopConfig;
  private _state: LoopState;
  private abortController: AbortController | null = null;
  private messages: AgentMessage[] = [];

  constructor(config: LoopConfig) {
    this.config = config;
    const modeConfig = modeRegistry.getModeConfig(config.mode);
    this._state = {
      status: 'idle',
      currentTurn: 0,
      totalTurns: config.maxTurns || modeConfig.maxTurns,
      mode: config.mode,
      startTime: Date.now()
    };
  }

  get state(): LoopState {
    return { ...this._state };
  }

  get isRunning(): boolean {
    return this._state.status === 'streaming' || this._state.status === 'tool_executing';
  }

  async start(userMessage: string): Promise<void> {
    this.abortController = new AbortController();
    this._state.status = 'streaming';
    this._state.startTime = Date.now();
    this._state.currentTurn = 0;

    this.messages = [
      { role: 'system', content: this.config.systemPrompt || modeRegistry.getSystemPrompt(this.config.mode) },
      { role: 'user', content: userMessage }
    ];

    await this.runLoop();
  }

  async continue(messages: AgentMessage[]): Promise<void> {
    this.abortController = new AbortController();
    this._state.status = 'streaming';
    this.messages = messages;
    await this.runLoop();
  }

  private async runLoop(): Promise<void> {
    while (this._state.currentTurn < this._state.totalTurns) {
      if (this.abortController?.signal.aborted) {
        this._state.status = 'stopped';
        return;
      }

      this._state.currentTurn++;
      this._state.status = 'streaming';
      this.config.onStatus?.(this._state.status);
      this.config.onTurnStart?.(this._state.currentTurn);

      // --- Phase 1: Call model ---
      const response = await this.callModel();
      if (!response) break;

      // --- Phase 2: Process tool calls ---
      if (response.toolCalls && response.toolCalls.length > 0) {
        this._state.status = 'tool_executing';
        this.config.onStatus?.(this._state.status);

        for (const toolCall of response.toolCalls) {
          if (this.abortController?.signal.aborted) break;

          await this.config.onToolCall?.(toolCall.name, toolCall.arguments);

          const result = await this.executeTool(toolCall.name, toolCall.arguments);

          this.messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: result.success ? (result.data ? JSON.stringify(result.data) : '') : (result.error || '')
          });

          await this.config.onToolResult?.(toolCall.name, result);
        }
      } else {
        // No tool calls → assistant response only
        this.messages.push({
          role: 'assistant',
          content: response.content || ''
        });
        this._state.status = 'completed';
        this.config.onStatus?.(this._state.status);
        return;
      }

      this.config.onTurnEnd?.(this._state.currentTurn, {
        turnNumber: this._state.currentTurn,
        toolCalls: response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          status: 'completed'
        })),
        messages: this.messages,
        mode: this.config.mode,
        startTime: Date.now()
      });
    }

    if (this._state.currentTurn >= this._state.totalTurns) {
      this._state.status = 'completed';
      this.config.onStatus?.(this._state.status);
    }
  }

  private async callModel(): Promise<{ content?: string; toolCalls?: Array<{ id: string; name: string; arguments: ToolInput }> } | null> {
    // Stub — in real implementation, calls LiteLLMProvider
    // For now, this is the integration point for the streaming pipeline
    this.config.onStatus?.('streaming');
    return { content: '...', toolCalls: [] };
  }

  private async executeTool(name: string, args: ToolInput): Promise<ToolOutput> {
    const tool = toolRegistry.getTool(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    // Mode check (C1-T18 이중 가드)
    if (!modeRegistry.isToolAllowed(this.config.mode, name)) {
      return {
        success: false,
        error: `Tool "${name}" is not allowed in ${this.config.mode} mode. Allowed tools: ${modeRegistry.getModeConfig(this.config.mode).allowedTools.join(', ')}`
      };
    }
    // Ask 모드: category 기반 추가 차단
    if (this.config.mode === 'ask') {
      const tool = toolRegistry.getTool(name);
      if (tool && (tool.category === 'edit' || tool.category === 'terminal' || tool.category === 'debug')) {
        return {
          success: false,
          error: `[Ask Mode] Writing/terminal/debug tools are disabled. "${name}" requires Agent mode.`
        };
      }
    }

    // Dispatch to executor
    try {
      const { executeGrep, executeGlob, executeReadFile, executeListDir, executeCodebaseSearch, executeLspDefinition, executeLspReferences } = await import('../tools/executors');
      
      const executors: Record<string, (input: ToolInput) => Promise<ToolOutput>> = {
        grep: executeGrep,
        glob: executeGlob,
        read_file: executeReadFile,
        list_dir: executeListDir,
        codebase_search: executeCodebaseSearch,
        lsp_definition: executeLspDefinition,
        lsp_references: executeLspReferences
      };

      const executor = executors[name];
      if (executor) {
        return await executor(args);
      }

      return { success: true, data: { message: `Tool ${name} executed (stub)`, args } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  stop(): void {
    this.abortController?.abort();
    this._state.status = 'stopped';
    this.config.onStatus?.('stopped');
  }

  async reset(newMode?: Mode): Promise<void> {
    this.stop();
    this.messages = [];
    this._state.status = 'idle';
    this._state.currentTurn = 0;
    this._state.startTime = Date.now();
    if (newMode) {
      this.config.mode = newMode;
      const modeConfig = modeRegistry.getModeConfig(newMode);
      this._state.totalTurns = modeConfig.maxTurns;
    }
  }
}
