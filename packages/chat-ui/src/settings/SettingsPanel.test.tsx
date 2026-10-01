/**
 * V31-UI-09 (UX-09) — Settings panel shell: search, nav scroll, focus trap,
 * keyboard navigation. Tab bodies are mocked to keep the test focused on the shell.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

vi.mock('./tabs/ModelsTab', () => ({ ModelsTab: () => <div>ModelsBody</div> }));
vi.mock('./tabs/PermissionTab', () => ({ PermissionTab: () => <div>PermissionBody</div> }));
vi.mock('./tabs/QueueTab', () => ({ QueueTab: () => <div>QueueBody</div> }));
vi.mock('./tabs/HarnessTab', () => ({ HarnessTab: () => <div>HarnessBody</div> }));
vi.mock('./tabs/ContextTab', () => ({ ContextTab: () => <div>ContextBody</div> }));
vi.mock('./tabs/McpTab', () => ({ McpTab: () => <div>McpBody</div> }));
vi.mock('./tabs/FeaturesTab', () => ({ FeaturesTab: () => <div>FeaturesBody</div> }));
vi.mock('./tabs/PrivacyTab', () => ({ PrivacyTab: () => <div>PrivacyBody</div> }));
vi.mock('./tabs/JsonConfigTab', () => ({ JsonConfigTab: () => <div>JsonBody</div> }));
vi.mock('./tabs/RulesTab', () => ({ RulesTab: () => <div>RulesBody</div> }));
vi.mock('./tabs/TerminalTab', () => ({ TerminalTab: () => <div>TerminalBody</div> }));
vi.mock('./tabs/ReviewTab', () => ({ ReviewTab: () => <div>ReviewBody</div> }));

describe('V31-UI-09 SettingsPanel', () => {
  afterEach(() => cleanup());

  it('filters tabs by setting-level keywords, not just labels', () => {
    render(<SettingsPanel />);
    // "temperature" is a setting term owned by the Models tab.
    fireEvent.change(screen.getByLabelText('Search settings tabs'), {
      target: { value: 'temperature' },
    });
    expect(screen.getByRole('button', { name: /AI Providers/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Terminal/ })).toBeNull();
  });

  it('shows an empty state when nothing matches', () => {
    render(<SettingsPanel />);
    fireEvent.change(screen.getByLabelText('Search settings tabs'), {
      target: { value: 'zzzz-no-match' },
    });
    expect(screen.getByText('No matching tabs')).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('moves focus with ArrowDown across visible tabs', () => {
    render(<SettingsPanel />);
    const nav = screen.getByLabelText('Settings categories');
    const tabs = Array.from(nav.querySelectorAll('.settings-tab'));
    tabs[0].focus();
    fireEvent.keyDown(nav, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(nav, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('traps Tab focus inside the dialog', () => {
    render(<SettingsPanel onClose={() => undefined} />);
    const panel = screen.getByRole('dialog', { name: 'Agent K Settings' });
    const focusables = panel.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    );
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
  });
});
