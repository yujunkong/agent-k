/**
 * ToolCallParser - 5가지 파싱 전략 순차 적용
 * 
 * 1) Native tool_calls (OpenAI/Anthropic 네이티브)
 * 2) XML 태그: <tool name="grep">{"pattern":"foo"}</tool>
 * 3) JSON 펜스: ```json\n{"name":"grep","arguments":{...}}\n```
 * 4) 이중 인코딩: 이스케이프된 JSON 문자열 디코딩 후 파싱
 * 5) Content 스캔: 일반 텍스트 중 도구 호출 패턴 휴리스틱 추출
 */

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  raw: string;
  confidence: number; // 0-1
  strategy: 'native' | 'xml' | 'json-fence' | 'double-encoded' | 'content-scan';
}

export class ToolCallParser {
  private toolCallIdCounter = 0;

  private nextId(): string {
    return `tool_${++this.toolCallIdCounter}_${Date.now()}`;
  }

  parse(content: any): ParsedToolCall[] {
    if (!content) return [];

    // Strategy 1: Native (OpenAI/Anthropic format)
    if (Array.isArray(content)) {
      const native = this.parseNative(content);
      if (native.length > 0) return native;
    }

    if (typeof content !== 'string') return [];

    const results: ParsedToolCall[] = [];

    // Strategy 2: XML tags
    const xml = this.parseXmlTags(content);
    results.push(...xml);

    // Strategy 3: JSON fence
    if (results.length === 0) {
      const jsonFence = this.parseJsonFence(content);
      results.push(...jsonFence);
    }

    // Strategy 4: Double-encoded
    if (results.length === 0) {
      const doubleEncoded = this.parseDoubleEncoded(content);
      results.push(...doubleEncoded);
    }

    // Strategy 5: Content scan (low confidence)
    if (results.length === 0) {
      const scanned = this.contentScan(content);
      results.push(...scanned);
    }

    return results;
  }

  private parseNative(content: any[]): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    for (const item of content) {
      if (item.type === 'function' || item.function) {
        const fn = item.function || item;
        try {
          results.push({
            id: item.id || this.nextId(),
            name: fn.name || '',
            arguments: typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments || {},
            raw: JSON.stringify(fn),
            confidence: 1.0,
            strategy: 'native'
          });
        } catch {
          // Parse error for native format
        }
      }
    }
    return results;
  }

  private parseXmlTags(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const tagRegex = /<tool\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tool>/gi;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      try {
        const name = match[1].trim();
        const argsStr = match[2].trim();
        const args = JSON.parse(argsStr);
        results.push({
          id: this.nextId(),
          name,
          arguments: args,
          raw: match[0],
          confidence: 0.95,
          strategy: 'xml'
        });
      } catch {
        // Try to parse as key=value pairs
        const name = match[1].trim();
        const argsStr = match[2].trim();
        results.push({
          id: this.nextId(),
          name,
          arguments: { content: argsStr },
          raw: match[0],
          confidence: 0.7,
          strategy: 'xml'
        });
      }
    }
    return results;
  }

  private parseJsonFence(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const fenceRegex = /```(?:json)?\s*(\{[\s\S]*?\})/g;
    let match;

    while ((match = fenceRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name || parsed.tool) {
          results.push({
            id: this.nextId(),
            name: parsed.name || parsed.tool || 'unknown',
            arguments: parsed.arguments || parsed.args || parsed,
            raw: match[0],
            confidence: 0.9,
            strategy: 'json-fence'
          });
        }
      } catch {
        // Continue
      }
    }
    return results;
  }

  private parseDoubleEncoded(content: string): ParsedToolCall[] {
    // Try to unescape and parse
    try {
      const unescaped = content
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
      
      if (unescaped !== content) {
        const result = this.parseJsonFence(unescaped);
        if (result.length > 0) {
          result.forEach(r => {
            r.strategy = 'double-encoded';
            r.confidence = 0.8;
          });
          return result;
        }
      }
    } catch {
      // Ignore
    }
    return [];
  }

  private contentScan(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];

    // Pattern: tool_name(key=value, key=value)
    const toolCallRegex = /(\w+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const argsStr = match[2].trim();

      // Skip common non-tool function calls
      if (['console', 'require', 'import', 'export', 'function', 'if', 'for', 'while'].includes(name)) {
        continue;
      }

      const args: Record<string, string> = {};
      const argPairs = argsStr.match(/(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'|(\w+)\s*=\s*(\S+)/g);
      if (argPairs) {
        for (const pair of argPairs) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > 0) {
            const key = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            args[key] = value;
          }
        }
      }

      // Only include if we extracted useful arguments
      if (Object.keys(args).length > 0 || argsStr.length > 0) {
        results.push({
          id: this.nextId(),
          name,
          arguments: args,
          raw: match[0],
          confidence: 0.5,
          strategy: 'content-scan'
        });
      }
    }

    return results;
  }
}

export const toolCallParser = new ToolCallParser();
