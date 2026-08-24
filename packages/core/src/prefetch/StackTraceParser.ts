/**
 * CTX-011 — StackTraceParser ported from v2.1 `src/prefetch/StackTraceParser.ts`.
 * Extracts file:line:col frames from multi-language stack traces (C1-T16).
 */

export interface StackFrame {
  file: string;
  line: number;
  column?: number;
  functionName?: string;
  language?: string;
}

const STACK_FRAME_PATTERNS = [
  // JS/TS: "at functionName (/path/file.ts:10:20)"
  /at\s+(?:(.+?)\s+\()?(?:\/[^:]+)?([a-zA-Z0-9_\-./\\]+(?:\.[a-z]+)):(\d+):(\d+)/g,
  // Python: 'File "/path/file.py", line 10, in functionName'
  /File\s+"([^"]+)",\s*line\s+(\d+)(?:,\s*in\s+(.+))?/g,
  // Rust: "--> src/main.rs:10:20"
  /-->\s+([^\s:]+):(\d+):(\d+)/g,
  // Java: "at com.example.Class.method(File.java:10)"
  /at\s+(?:[a-zA-Z0-9_.]+\.)*[A-Z][a-zA-Z0-9]+\.[a-z][a-zA-Z0-9]*\(([^:]+):(\d+)\)/g,
  // Go: "path/file.go:10"
  /([a-zA-Z0-9_\-./\\]+\.go):(\d+)(?::(\d+))?/g,
  // Generic: "file:line:col"
  /([a-zA-Z0-9_\-./\\]+\.[a-z]+):(\d+):(\d+)/g,
  // Generic: "file:line"
  /([a-zA-Z0-9_\-./\\]+\.[a-z]+):(\d+)\b(?!:)/g,
];

export function parseStackTrace(text: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const seen = new Set<string>();

  for (const pattern of STACK_FRAME_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const file = match[1]?.trim();
      const line = parseInt(match[2], 10);
      const column = match[3] ? parseInt(match[3], 10) : undefined;
      const functionName = match[4] || match[3];

      if (!file || !line) continue;

      const key = `${file}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const ext = file.split('.').pop()?.toLowerCase();
      const language = ext ? inferLanguage(ext) : undefined;

      frames.push({ file, line, column, functionName, language });
    }
  }

  return frames;
}

export function getContextFiles(
  text: string,
  contextLines = 3
): Array<{ file: string; startLine: number; endLine: number }> {
  const frames = parseStackTrace(text);
  if (frames.length === 0) return [];

  const fileGroups = new Map<string, number[]>();
  for (const frame of frames) {
    if (!fileGroups.has(frame.file)) {
      fileGroups.set(frame.file, []);
    }
    fileGroups.get(frame.file)!.push(frame.line);
  }

  const result: Array<{ file: string; startLine: number; endLine: number }> = [];
  for (const [file, lines] of fileGroups) {
    const minLine = Math.max(1, Math.min(...lines) - contextLines);
    const maxLine = Math.max(...lines) + contextLines;
    result.push({ file, startLine: minLine, endLine: maxLine });
  }

  return result;
}

function inferLanguage(ext: string): string | undefined {
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    rb: 'ruby',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
  };
  return langMap[ext];
}
