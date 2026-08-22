/**
 * SAFE-001 / SAFE-002 / SAFE-003 / SAFE-004 unit tests.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DENY_GLOBS,
  isPathDenied,
  matchGlobPattern,
} from './denyGlobs';
import {
  isTerminalCommandDenied,
  matchTerminalDenyPattern,
} from './terminalDenyPatterns';
import { PermissionGate } from './PermissionGate';
import { canWrite, canWriteResult } from './writeGate';

describe('SAFE-002 denyGlobs', () => {
  it('matches default sensitive paths', () => {
    expect(isPathDenied('config/.env.local')).toBe(true);
    expect(isPathDenied('secrets/api.key')).toBe(true);
    expect(isPathDenied('keys/id_rsa')).toBe(true);
    expect(isPathDenied('certs/server.pem')).toBe(true);
    expect(isPathDenied('.git/config')).toBe(true);
    expect(isPathDenied('node_modules/foo/index.js')).toBe(true);
    expect(isPathDenied('src/app.ts')).toBe(false);
  });

  it('matchGlobPattern supports ** prefixes', () => {
    expect(matchGlobPattern('a/b/.env', '**/.env*')).toBe(true);
    expect(matchGlobPattern('src/ok.ts', '**/.env*')).toBe(false);
  });

  it('exposes DEFAULT_DENY_GLOBS', () => {
    expect(DEFAULT_DENY_GLOBS).toContain('**/.env*');
    expect(DEFAULT_DENY_GLOBS).toContain('**/node_modules/**');
  });
});

describe('SAFE-003 terminalDenyPatterns', () => {
  it('denies catastrophic commands', () => {
    expect(isTerminalCommandDenied('sudo rm -rf /')).toBe(true);
    expect(isTerminalCommandDenied('mkfs.ext4 /dev/sda')).toBe(true);
    expect(isTerminalCommandDenied('dd if=/dev/zero of=/dev/sda')).toBe(true);
    expect(isTerminalCommandDenied(':(){ :|:& };:')).toBe(true);
    expect(isTerminalCommandDenied('npm test')).toBe(false);
  });

  it('returns matched pattern details', () => {
    const match = matchTerminalDenyPattern('echo; mkfs /dev/sda');
    expect(match?.pattern).toBe('mkfs');
  });
});

describe('SAFE-004 writeGate', () => {
  it('blocks denied paths at any level', () => {
    const d = canWrite({ level: 'bypass', path: '.env' });
    expect(d.allowed).toBe(false);
    expect(d.error?.code).toBe('PATH_DENIED');
  });

  it('ask requires approval', () => {
    const d = canWrite({ level: 'ask', path: 'src/a.ts' });
    expect(d.allowed).toBe(false);
    expect(d.needsApproval).toBe(true);
  });

  it('accept_edits allows normal paths', () => {
    expect(canWrite({ level: 'accept_edits', path: 'src/a.ts' }).allowed).toBe(
      true,
    );
    expect(canWriteResult({ level: 'auto', path: 'src/a.ts' }).ok).toBe(true);
  });
});

describe('SAFE-001 PermissionGate', () => {
  it('bypass always allows', async () => {
    const gate = new PermissionGate('bypass');
    await expect(
      gate.requestPermission({ toolName: 'delete_file', path: 'src/x.ts' }),
    ).resolves.toBe('allow_once');
  });

  it('rejects deny-glob paths', async () => {
    const gate = new PermissionGate('auto');
    await expect(
      gate.requestPermission({ toolName: 'edit_file', path: '.env' }),
    ).resolves.toBe('reject');
  });

  it('accept_edits allows edits; asks for shell', async () => {
    const gate = new PermissionGate('accept_edits');
    const listener = vi.fn(async () => 'allow_once' as const);
    gate.subscribe(listener);

    await expect(
      gate.requestPermission({ toolName: 'edit_file', path: 'src/a.ts' }),
    ).resolves.toBe('allow_once');
    expect(listener).not.toHaveBeenCalled();

    await expect(
      gate.requestPermission({ toolName: 'run_terminal_cmd', path: '' }),
    ).resolves.toBe('allow_once');
    expect(listener).toHaveBeenCalled();
  });

  it('session allow skips subsequent asks', async () => {
    const gate = new PermissionGate('accept_edits');
    gate.subscribe(async () => 'allow_session');
    await gate.requestPermission({
      toolName: 'run_terminal_cmd',
      path: 'cwd',
    });
    const listener2 = vi.fn(async () => 'reject' as const);
    gate.subscribe(listener2);
    // First listener still registered — clear and use only session
    // Clear listeners by constructing fresh gate with session pre-set
    const gate2 = new PermissionGate('accept_edits');
    gate2.allowSession('run_terminal_cmd', 'cwd');
    gate2.subscribe(listener2);
    await expect(
      gate2.requestPermission({ toolName: 'run_terminal_cmd', path: 'cwd' }),
    ).resolves.toBe('allow_once');
    expect(listener2).not.toHaveBeenCalled();
  });

  it('ask with no listener rejects (fail closed)', async () => {
    const gate = new PermissionGate('ask');
    await expect(
      gate.requestPermission({ toolName: 'edit_file', path: 'a.ts' }),
    ).resolves.toBe('reject');
  });

  it('requestPermissionResult returns R-005 error on reject', async () => {
    const gate = new PermissionGate('ask');
    const result = await gate.requestPermissionResult({
      toolName: 'edit_file',
      path: 'a.ts',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
    }
  });
});
