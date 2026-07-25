/**
 * Templates - 계측 코드 템플릿 (C6-T25)
 */
export type TemplateType = 'console_log' | 'perf_mark' | 'error_boundary';

export interface CodeTemplate {
  type: TemplateType;
  language: string;
  code: string;
  description: string;
}

export const TEMPLATE_LIBRARY: CodeTemplate[] = [
  // ===== Console Log =====
  {
    type: 'console_log',
    language: 'typescript',
    code: `console.log('[DEBUG]', { method: '$METHOD', args: $ARGS });`,
    description: 'Log method entry with arguments'
  },
  {
    type: 'console_log',
    language: 'python',
    code: `import logging; logger = logging.getLogger(__name__); logger.debug(f'[$METHOD] args={$ARGS}')`,
    description: 'Python structured logging'
  },

  // ===== Performance Mark =====
  {
    type: 'perf_mark',
    language: 'typescript',
    code: `performance.mark('$LABEL-start');
// ... code ...
performance.mark('$LABEL-end');
performance.measure('$LABEL', '$LABEL-start', '$LABEL-end');`,
    description: 'Performance measurement with marks'
  },
  {
    type: 'perf_mark',
    language: 'javascript',
    code: `console.time('$LABEL');
// ... code ...
console.timeEnd('$LABEL');`,
    description: 'Simple timing with console.time'
  },

  // ===== Error Boundary =====
  {
    type: 'error_boundary',
    language: 'typescript',
    code: `try {
  // ... code ...
} catch (err) {
  console.error('[DEBUG:ERROR]', err);
  throw err; // re-throw to preserve behavior
}`,
    description: 'Error boundary with logging'
  },
  {
    type: 'error_boundary',
    language: 'python',
    code: `try:
    # ... code ...
except Exception as e:
    import traceback
    logger.error(f'[DEBUG:ERROR] {e}\\n{traceback.format_exc()}')
    raise`,
    description: 'Python error boundary with traceback'
  },
  {
    type: 'error_boundary',
    language: 'go',
    code: `if err != nil {
    log.Printf("[DEBUG:ERROR] %+v", err)
    return err
}`,
    description: 'Go error boundary logging'
  }
];

export function getTemplatesByType(type: TemplateType): CodeTemplate[] {
  return TEMPLATE_LIBRARY.filter(t => t.type === type);
}

export function getTemplatesByLanguage(language: string): CodeTemplate[] {
  return TEMPLATE_LIBRARY.filter(t => t.language === language);
}
