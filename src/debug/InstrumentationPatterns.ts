/**
 * InstrumentationPatterns - 언어별 계측 패턴 라이브러리 (C6-T04)
 */
export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'go' | 'rust' | 'unknown';

export interface InstrumentationTemplate {
  language: SupportedLanguage;
  entry: (label: string, vars?: string[]) => string;
  exit: (label: string) => string;
  conditional: (label: string, condition: string, vars?: string[]) => string;
  dump: (label: string, expr: string) => string;
  marker: string;
}

const MARKER = 'DEBUG_INSTRUMENT';

export const TEMPLATES: Record<SupportedLanguage, InstrumentationTemplate> = {
  javascript: {
    language: 'javascript',
    marker: `// ${MARKER}`,
    entry: (label, vars) =>
      vars?.length
        ? `console.log('[${MARKER}:${label}] ENTER:', ${vars.join(', ')});`
        : `console.log('[${MARKER}:${label}] ENTER');`,
    exit: (label) => `console.log('[${MARKER}:${label}] EXIT');`,
    conditional: (label, condition, vars) =>
      `if (${condition}) console.log('[${MARKER}:${label}] COND:', ${vars?.join(', ') || 'true'});`,
    dump: (label, expr) => `console.log('[${MARKER}:${label}] DUMP:', JSON.stringify(${expr}, null, 2));`
  },
  typescript: {
    language: 'typescript',
    marker: `// ${MARKER}`,
    entry: (label, vars) =>
      vars?.length
        ? `console.log('[${MARKER}:${label}] ENTER:', ${vars.join(', ')});`
        : `console.log('[${MARKER}:${label}] ENTER');`,
    exit: (label) => `console.log('[${MARKER}:${label}] EXIT');`,
    conditional: (label, condition, vars) =>
      `if (${condition}) console.log('[${MARKER}:${label}] COND:', ${vars?.join(', ') || 'true'});`,
    dump: (label, expr) => `console.log('[${MARKER}:${label}] DUMP:', JSON.stringify(${expr}, null, 2));`
  },
  python: {
    language: 'python',
    marker: `# ${MARKER}`,
    entry: (label, vars) =>
      vars?.length
        ? `print(f'[${MARKER}:${label}] ENTER: {${vars.join(', ')}}')`
        : `print(f'[${MARKER}:${label}] ENTER')`,
    exit: (label) => `print(f'[${MARKER}:${label}] EXIT')`,
    conditional: (label, condition, vars) =>
      `if ${condition}: print(f'[${MARKER}:${label}] COND: {${vars?.join(', ') || 'True'}}')`,
    dump: (label, expr) => `import json; print(f'[${MARKER}:${label}] DUMP:', json.dumps(${expr}, default=str))`
  },
  go: {
    language: 'go',
    marker: `// ${MARKER}`,
    entry: (label, vars) =>
      `log.Printf("[${MARKER}:${label}] ENTER: %v", ${vars?.join(', ') || '""'})`,
    exit: (label) => `log.Printf("[${MARKER}:${label}] EXIT")`,
    conditional: (label, condition, vars) =>
      `if ${condition} { log.Printf("[${MARKER}:${label}] COND: %v", ${vars?.join(', ') || 'true'}) }`,
    dump: (label, expr) => {
      const jsonExpr = `fmt.Sprintf("%+v", ${expr})`;
      return `log.Printf("[${MARKER}:${label}] DUMP: %s", ${jsonExpr})`;
    }
  },
  rust: {
    language: 'rust',
    marker: `// ${MARKER}`,
    entry: (label, vars) =>
      vars?.length
        ? `println!("[${MARKER}:${label}] ENTER: {:?}", (${vars.join(', ')}));`
        : `println!("[${MARKER}:${label}] ENTER");`,
    exit: (label) => `println!("[${MARKER}:${label}] EXIT");`,
    conditional: (label, condition, vars) =>
      `if ${condition} { println!("[${MARKER}:${label}] COND: {:?}", (${vars?.join(', ') || 'true'})); }`,
    dump: (label, expr) => `println!("[${MARKER}:${label}] DUMP: {:#?}", ${expr});`
  },
  unknown: {
    language: 'unknown',
    marker: `# ${MARKER}`,
    entry: (label) => `# [${MARKER}:${label}] ENTER`,
    exit: (label) => `# [${MARKER}:${label}] EXIT`,
    conditional: (label, condition) => `# [${MARKER}:${label}] COND: ${condition}`,
    dump: (label, expr) => `# [${MARKER}:${label}] DUMP: ${expr}`
  }
};

export function getLanguageForFile(filePath: string): SupportedLanguage {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'rs': return 'rust';
    default: return 'unknown';
  }
}

export function getTemplate(filePath: string): InstrumentationTemplate {
  const lang = getLanguageForFile(filePath);
  return TEMPLATES[lang];
}
