/**
 * CFG-003 — Permission configuration unit tests.
 */
import { describe, expect, it } from 'vitest';
import {
  CFG003_FLAT_KEYS,
  DEFAULT_DENY_GLOBS,
  DEFAULT_PERMISSION_LEVEL,
  DEFAULT_REQUIRE_APPROVAL_TOOLS,
  PERMISSION_CONFIG_DEFAULTS,
  extractPermissionConfig,
  extractPermissionSettings,
  extractWriteGatePolicySettings,
  isPathDenied,
  isPermissionGatedToolName,
  isWriteToolName,
  mergePermissionSettings,
  normalizeDenyGlobs,
  parsePermissionLevel,
  parseRequireApprovalTools,
  permissionConfigToFlat,
  toolRequiresExplicitApproval,
} from './PermissionConfig';

describe('PermissionConfig (CFG-003)', () => {
  it('parsePermissionLevel accepts enum and falls back', () => {
    expect(parsePermissionLevel('ask')).toBe('ask');
    expect(parsePermissionLevel('garbage')).toBe(DEFAULT_PERMISSION_LEVEL);
  });

  it('normalizeDenyGlobs uses defaults and reports bad shapes', () => {
    expect(normalizeDenyGlobs(undefined).globs).toEqual([...DEFAULT_DENY_GLOBS]);
    const bad = normalizeDenyGlobs(42);
    expect(bad.issues[0]?.code).toBe('invalid_deny_globs');
    expect(bad.globs).toEqual([...DEFAULT_DENY_GLOBS]);
  });

  it('DEFAULT_DENY_GLOBS covers secrets and VCS paths', () => {
    expect(DEFAULT_DENY_GLOBS).toContain('**/.env*');
    expect(DEFAULT_DENY_GLOBS).toContain('**/secrets/**');
    expect(DEFAULT_DENY_GLOBS).toContain('**/.git/**');
  });

  it('parseRequireApprovalTools defaults to trio', () => {
    expect(parseRequireApprovalTools(undefined)).toEqual([
      ...DEFAULT_REQUIRE_APPROVAL_TOOLS,
    ]);
    expect(parseRequireApprovalTools(['delete_file'])).toEqual(['delete_file']);
  });

  it('extractPermissionSettings fills defaults for partial flat maps', () => {
    const settings = extractPermissionSettings({
      'agent-k.permission.level': 'bypass',
    });
    expect(settings.level).toBe('bypass');
    expect(settings.denyGlobs).toEqual([...DEFAULT_DENY_GLOBS]);
  });

  it('mergePermissionSettings lets override win', () => {
    const merged = mergePermissionSettings(
      {
        level: 'accept_edits',
        denyGlobs: DEFAULT_DENY_GLOBS,
        requireApprovalTools: DEFAULT_REQUIRE_APPROVAL_TOOLS,
      },
      { level: 'ask', denyGlobs: ['**/secrets/**'] },
    );
    expect(merged.level).toBe('ask');
    expect(merged.denyGlobs).toEqual(['**/secrets/**']);
    expect(merged.requireApprovalTools).toEqual([...DEFAULT_REQUIRE_APPROVAL_TOOLS]);
  });

  it('extractPermissionConfig round-trips via permissionConfigToFlat', () => {
    const parsed = extractPermissionConfig({
      'agent-k.permission.level': 'auto',
      'agent-k.permission.denyGlobs': ['**/secrets/**'],
      'agent-k.permission.requireApprovalTools': ['delete_file'],
      'agent-k.plan.forceOnComplex': true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(permissionConfigToFlat(parsed.value)).toEqual({
      'agent-k.permission.level': 'auto',
      'agent-k.permission.denyGlobs': ['**/secrets/**'],
      'agent-k.permission.requireApprovalTools': ['delete_file'],
      'agent-k.plan.forceOnComplex': true,
    });
  });

  it('extractPermissionConfig fails on invalid level / forceOnComplex', () => {
    const bad = extractPermissionConfig({
      'agent-k.permission.level': 'nope',
      'agent-k.plan.forceOnComplex': 'yes',
    });
    expect(bad.ok).toBe(false);
  });

  it('isPathDenied matches env and secrets paths', () => {
    expect(isPathDenied('config/.env.local', DEFAULT_DENY_GLOBS)).toBe(true);
    expect(isPathDenied('secrets/foo', DEFAULT_DENY_GLOBS)).toBe(true);
    expect(isPathDenied('src/foo.ts', DEFAULT_DENY_GLOBS)).toBe(false);
  });

  it('toolRequiresExplicitApproval follows level rules', () => {
    expect(
      toolRequiresExplicitApproval('write_file', 'accept_edits'),
    ).toBe(false);
    expect(
      toolRequiresExplicitApproval('run_terminal_cmd', 'accept_edits'),
    ).toBe(true);
    expect(toolRequiresExplicitApproval('write_file', 'ask')).toBe(true);
    expect(toolRequiresExplicitApproval('run_terminal_cmd', 'bypass')).toBe(false);
  });

  it('extractWriteGatePolicySettings reads forceOnComplex', () => {
    expect(
      extractWriteGatePolicySettings({ 'agent-k.plan.forceOnComplex': true })
        .forceOnComplex,
    ).toBe(true);
    expect(
      extractWriteGatePolicySettings({ 'agent-k.plan.forceOnComplex': 'yes' })
        .forceOnComplex,
    ).toBe(false);
  });

  it('write vs gated tool classification', () => {
    expect(isWriteToolName('edit_file')).toBe(true);
    expect(isWriteToolName('checkpoint_restore')).toBe(false);
    expect(isPermissionGatedToolName('checkpoint_restore')).toBe(true);
  });

  it('PERMISSION_CONFIG_DEFAULTS covers every CFG-003 flat key', () => {
    for (const key of CFG003_FLAT_KEYS) {
      expect(PERMISSION_CONFIG_DEFAULTS[key]).toBeDefined();
    }
  });
});
