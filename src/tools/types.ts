/**
 * 도구 타입 정의
 */
export interface ToolInput {
  [key: string]: any;
}

export interface ToolOutput {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    duration: number;
    cached?: boolean;
    truncated?: boolean;
    source?: string;
  };
}

export interface ToolExecutor {
  name: string;
  execute(input: ToolInput): Promise<ToolOutput>;
}

// JSON Schema helpers for tool parameters
export function stringParam(description: string, optional = false) {
  return { type: 'string' as const, description, ...(optional ? {} : {}) };
}

export function numberParam(description: string, optional = false) {
  return { type: 'number' as const, description, ...(optional ? {} : {}) };
}

export function booleanParam(description: string) {
  return { type: 'boolean' as const, description };
}

export function arrayParam(items: any, description: string) {
  return { type: 'array' as const, items, description };
}

export function objectParam(properties: Record<string, any>, description: string) {
  return { type: 'object' as const, properties, description };
}
