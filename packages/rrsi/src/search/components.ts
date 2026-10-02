/**
 * Component tagging — port of rrsi/components.py.
 *
 * Every edit is tagged with the harness component it modifies; the
 * declaration is validated against K and text_only edits are recognized so a
 * mislabelled prompt tweak cannot pass as a skill.
 */

import type { Component } from '../types';

/** String-literal or comment line (a model-facing text edit). */
const STRING_LINE = /^[+-]\s*(?:[rbf]?(?:"""|'''|["'`])|\/\/|\/\*|\*|#)/;

/** True when every changed line is a string/comment — a text (prompt) edit. */
export function textOnly(diff: string): boolean {
  const changed = diff
    .split('\n')
    .filter(
      (l) =>
        (l.startsWith('+') || l.startsWith('-')) &&
        !l.startsWith('+++') &&
        !l.startsWith('---') &&
        l.slice(1).trim()
    );
  if (!changed.length) return false;
  return changed.every(
    (l) => STRING_LINE.test(l) || l.slice(1).trimStart().startsWith('#')
  );
}

/** Diff regexes -> component tag recovery when the declaration is missing. */
export const COMPONENT_SIGNALS: Array<{ component: Component; patterns: RegExp[] }> = [
  {
    component: 'memory',
    patterns: [/\bMemory\(/, /\.remember\(/, /\.recall\(/, /_STATE_DIR/],
  },
  {
    component: 'skill',
    patterns: [/skills\//, /SkillRegistry/, /skill_use/, /skill_catalog/],
  },
  {
    component: 'client_tool',
    patterns: [/ToolRegistry/, /register_tool/, /tool_spec/, /CLIENT_TOOLS/],
  },
  {
    component: 'subagent',
    patterns: [/\bsubcall\(/, /sub_agent/, /subagent/],
  },
];

export function isValidComponent(c: string): c is Component {
  return (
    [
      'prompt',
      'control_flow',
      'config',
      'output_plumbing',
      'context_mgmt',
      'client_tool',
      'skill',
      'memory',
      'subagent',
    ].includes(c)
  );
}

/**
 * Recover a component tag from the diff when missing/invalid. Text-only diffs
 * recover to `prompt`; structural signals are matched on added lines only.
 */
export function recoverComponent(diff: string): Component {
  if (textOnly(diff)) return 'prompt';
  const added = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  for (const { component, patterns } of COMPONENT_SIGNALS) {
    if (patterns.some((p) => p.test(added))) return component;
  }
  return 'config';
}
