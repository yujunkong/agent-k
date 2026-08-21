/**
 * EXT-002 — Shell unit tests (jsdom): ui.ready on mount + host.hello status.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { Shell } from './Shell';
import { setVsCodeApiForTests, type VsCodeApi } from './vscodeApi';

describe('EXT-002 Shell', () => {
  let posted: unknown[];
  let api: VsCodeApi;

  beforeEach(() => {
    posted = [];
    api = {
      postMessage: (message: unknown) => {
        posted.push(message);
      },
      getState: () => undefined,
      setState: () => undefined,
    };
    setVsCodeApiForTests(api);
  });

  afterEach(() => {
    cleanup();
    setVsCodeApiForTests(undefined);
  });

  it('posts ui.ready on mount', () => {
    render(<Shell />);
    expect(posted).toEqual([
      { type: 'ui.ready', protocolVersion: PROTOCOL_VERSION },
    ]);
    expect(screen.getByTestId('chat-shell')).toBeTruthy();
    expect(screen.getByText('Agent K')).toBeTruthy();
  });

  it('shows Connected after host.hello', async () => {
    render(<Shell />);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'host.hello',
          protocolVersion: PROTOCOL_VERSION,
          extensionVersion: '0.0.0-test',
        },
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('chat-shell-status').getAttribute('data-state')).toBe(
        'ok',
      );
    });
    expect(screen.getByTestId('chat-shell-status').textContent).toContain(
      '0.0.0-test',
    );
  });

  it('shows error on protocol mismatch', async () => {
    render(<Shell />);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'host.hello',
          protocolVersion: 999,
          extensionVersion: 'x',
        },
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('chat-shell-status').getAttribute('data-state')).toBe(
        'error',
      );
    });
    expect(screen.getByTestId('chat-shell-status').textContent).toContain(
      'Protocol mismatch',
    );
  });
});
