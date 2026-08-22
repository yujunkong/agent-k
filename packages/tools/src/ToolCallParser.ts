/**
 * TOOL-008 ToolCallParser — pure OpenAI-style tool_calls + XML-ish fallback.
 * No provider/UI dependencies.
 */

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  raw: string;
  confidence: number;
  strategy: 'native' | 'xml' | 'json-fence' | 'json-array' | 'plain';
}

export class ToolCallParser {
  private toolCallIdCounter = 0;

  private nextId(): string {
    this.toolCallIdCounter += 1;
    return `tool_${this.toolCallIdCounter}_${Date.now()}`;
  }

  /**
   * Parse native tool_calls arrays, plain [{name,arguments}], XML, or JSON fence.
   */
  parse(content: unknown): ParsedToolCall[] {
    if (content == null) return [];

    if (Array.isArray(content)) {
      const plain = this.parsePlainItems(content, 'plain');
      if (plain.length) return plain;
      const native = this.parseNative(content);
      if (native.length) return native;
      return [];
    }

    if (typeof content !== 'string') return [];

    const xml = this.parseXmlTags(content);
    if (xml.length) return xml;

    const fence = this.parseJsonFence(content);
    if (fence.length) return fence;

    const bare = this.parseBareJson(content);
    if (bare.length) return bare;

    return [];
  }

  private parseNative(items: unknown[]): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (rec.type === 'function' || rec.function) {
        const fn = (rec.function ?? rec) as Record<string, unknown>;
        let args: Record<string, unknown> = {};
        try {
          args =
            typeof fn.arguments === 'string'
              ? (JSON.parse(fn.arguments) as Record<string, unknown>)
              : ((fn.arguments as Record<string, unknown>) ?? {});
        } catch {
          args = { raw: String(fn.arguments) };
        }
        results.push({
          id: typeof rec.id === 'string' ? rec.id : this.nextId(),
          name: String(fn.name ?? ''),
          arguments: args && typeof args === 'object' ? args : {},
          raw: JSON.stringify(fn),
          confidence: 1,
          strategy: 'native',
        });
      }
    }
    return results.filter((r) => r.name);
  }

  private parsePlainItems(
    items: unknown[],
    strategy: ParsedToolCall['strategy']
  ): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (rec.type === 'function' || rec.function) continue;
      const name = rec.name ?? rec.tool;
      if (typeof name !== 'string' || !name) continue;
      let args: unknown = rec.arguments ?? rec.args ?? {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = { raw: args };
        }
      }
      results.push({
        id: typeof rec.id === 'string' ? rec.id : this.nextId(),
        name,
        arguments:
          args && typeof args === 'object'
            ? (args as Record<string, unknown>)
            : {},
        raw: JSON.stringify(item),
        confidence: strategy === 'native' ? 1 : 0.92,
        strategy,
      });
    }
    return results;
  }

  /** `<tool name="grep">{"pattern":"foo"}</tool>` */
  private parseXmlTags(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const re =
      /<tool\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/tool>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      const body = match[2].trim();
      let args: Record<string, unknown> = {};
      if (body) {
        try {
          args = JSON.parse(body) as Record<string, unknown>;
        } catch {
          args = { raw: body };
        }
      }
      results.push({
        id: this.nextId(),
        name,
        arguments: args,
        raw: match[0],
        confidence: 0.9,
        strategy: 'xml',
      });
    }
    return results;
  }

  /** ```json ... ``` fence containing tool call object/array */
  private parseJsonFence(content: string): ParsedToolCall[] {
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fence) return [];
    try {
      const parsed = JSON.parse(fence[1].trim()) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const calls = this.parsePlainItems(items, 'json-fence');
      if (calls.length) return calls;
      return this.parseNative(items);
    } catch {
      return [];
    }
  }

  private parseBareJson(content: string): ParsedToolCall[] {
    const trimmed = content.trim();
    const startArr = trimmed.indexOf('[');
    const startObj = trimmed.indexOf('{');
    if (startArr < 0 && startObj < 0) return [];

    const preferArr = startArr >= 0 && (startObj < 0 || startArr <= startObj);
    const start = preferArr ? startArr : startObj;
    const open = preferArr ? '[' : '{';
    const close = preferArr ? ']' : '}';
    const extracted = this.extractBalanced(trimmed, start, open, close);
    if (!extracted) return [];

    try {
      const parsed = JSON.parse(extracted) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const plain = this.parsePlainItems(items, 'json-array');
      if (plain.length) return plain;
      return this.parseNative(items);
    } catch {
      return [];
    }
  }

  private extractBalanced(
    content: string,
    start: number,
    open: string,
    close: string
  ): string | null {
    if (content[start] !== open) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return content.slice(start, i + 1);
      }
    }
    return null;
  }
}

/** Shared parser instance. */
export const toolCallParser = new ToolCallParser();
