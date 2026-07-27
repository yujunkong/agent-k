/**
 * ADDON-T10: slash command UX — resolveSlashCommand + new command filtering
 */
import * as assert from 'assert';
import {
  SLASH_COMMANDS,
  filterSlashCommands,
  resolveSlashCommand
} from '../../../src/chat/composerPalette';

suite('ADDON-T10 slash commands', () => {
  test('SLASH_COMMANDS includes compact/cost/model/permissions/help', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    for (const id of ['compact', 'cost', 'model', 'permissions', 'help']) {
      assert.ok(ids.includes(id), `missing command: ${id}`);
    }
  });

  test('resolveSlashCommand resolves known commands', () => {
    for (const id of ['compact', 'cost', 'model', 'permissions', 'help']) {
      const r = resolveSlashCommand(`/${id}`);
      assert.strictEqual(r.ok, true);
      if (r.ok) assert.strictEqual(r.cmd.id, id);
    }
  });

  test('resolveSlashCommand is case-insensitive and ignores trailing args', () => {
    const r = resolveSlashCommand('/Cost extra args here');
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.cmd.id, 'cost');
  });

  test('resolveSlashCommand rejects non-slash input', () => {
    const r = resolveSlashCommand('cost');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.ok(r.error.includes('slash'));
  });

  test('resolveSlashCommand gives a friendly error for unknown commands', () => {
    const r = resolveSlashCommand('/frobnicate');
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.ok(r.error.includes('frobnicate'));
      assert.ok(r.error.toLowerCase().includes('unknown'));
    }
  });

  test('resolveSlashCommand gives a friendly error for empty command', () => {
    const r = resolveSlashCommand('/');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.ok(r.error.length > 0);
  });

  test('filterSlashCommands("cos") matches /cost', () => {
    const hits = filterSlashCommands('cos');
    assert.ok(hits.some((c) => c.id === 'cost'));
  });

  test('filterSlashCommands("perm") matches /permissions', () => {
    const hits = filterSlashCommands('perm');
    assert.ok(hits.some((c) => c.id === 'permissions'));
  });

  test('filterSlashCommands with empty query returns the full list', () => {
    assert.strictEqual(filterSlashCommands('').length, SLASH_COMMANDS.length);
  });
});
