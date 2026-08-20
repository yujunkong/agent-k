/**
 * ToolResultFormatter - 프로바이더별 tool_result 포맷 변환
 * 
 * OpenAI: {role: "tool", tool_call_id, content}
 * Anthropic: {role: "user", content: [{type: "tool_result", tool_use_id, content}]}
 * Custom: {role: "tool", name, content, metadata}
 */

export type ProviderFormat = 'openai' | 'anthropic' | 'custom';

export interface FormattedToolResult {
  role: string;
  content: any;
  tool_call_id?: string;
  tool_use_id?: string;
  name?: string;
  metadata?: Record<string, any>;
}

const MAX_RESULT_SIZE = 32 * 1024; // 32KB
const MAX_TOKEN_COUNT = 8000;

export class ToolResultFormatter {
  private formatters: Map<ProviderFormat, (result: ToolResultInput) => FormattedToolResult> = new Map();

  constructor() {
    this.formatters.set('openai', this.formatOpenAI.bind(this));
    this.formatters.set('anthropic', this.formatAnthropic.bind(this));
    this.formatters.set('custom', this.formatCustom.bind(this));
  }

  format(result: ToolResultInput, format: ProviderFormat = 'custom'): FormattedToolResult {
    const formatter = this.formatters.get(format) || this.formatters.get('custom')!;
    return formatter(result);
  }

  private truncateContent(content: string, path?: string): string {
    if (content.length <= MAX_RESULT_SIZE) return content;
    const truncated = content.slice(0, MAX_RESULT_SIZE);
    return path
      ? `${truncated}\n\n...(truncated, path=${path})`
      : `${truncated}\n\n...(truncated, ${content.length} bytes)`;
  }

  private formatOpenAI(result: ToolResultInput): FormattedToolResult {
    return {
      role: 'tool',
      tool_call_id: result.toolCallId,
      content: this.truncateContent(result.content, result.path)
    };
  }

  private formatAnthropic(result: ToolResultInput): FormattedToolResult {
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: result.toolCallId,
        content: this.truncateContent(result.content, result.path),
        ...(result.isError ? { is_error: true } : {})
      }]
    };
  }

  private formatCustom(result: ToolResultInput): FormattedToolResult {
    return {
      role: 'tool',
      name: result.name || 'unknown',
      content: this.truncateContent(result.content, result.path),
      metadata: {
        isError: result.isError,
        path: result.path,
        truncated: result.content.length > MAX_RESULT_SIZE,
        originalSize: result.content.length
      }
    };
  }
}

export interface ToolResultInput {
  toolCallId: string;
  name?: string;
  content: string;
  path?: string;
  isError?: boolean;
  metadata?: Record<string, any>;
}

export const toolResultFormatter = new ToolResultFormatter();
