/**
 * CHAT-001 / CHAT-002 — ChatApp unit tests (jsdom).
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { ChatApp } from './ChatApp';
import { setVsCodeApiForTests, type VsCodeApi } from './vscodeApi';

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement | HTMLTextAreaElement).disabled === true;
}

describe('CHAT-001 ChatApp shell', () => {
  let posted: unknown[];

  beforeEach(() => {
    posted = [];
    const api: VsCodeApi = {
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

  it('posts ui.ready and renders shell chrome', () => {
    render(<ChatApp />);
    expect(posted).toEqual([
      { type: 'ui.ready', protocolVersion: PROTOCOL_VERSION },
    ]);
    expect(screen.getByTestId('chat-app')).toBeTruthy();
    expect(screen.getByTestId('chat-shell')).toBeTruthy();
    expect(screen.getByTestId('chat-composer')).toBeTruthy();
    expect(screen.getAllByText('Agent K').length).toBeGreaterThan(0);
  });

  it('enables composer after host.hello', async () => {
    render(<ChatApp />);
    expect(isDisabled(screen.getByTestId('chat-send'))).toBe(true);

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
    expect(isDisabled(screen.getByTestId('chat-input'))).toBe(false);
  });

  it('CHAT-002 sends chat.send and shows user bubble', async () => {
    render(<ChatApp />);
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
      expect(isDisabled(screen.getByTestId('chat-input'))).toBe(false);
    });

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'hello from test' },
    });
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(screen.getByText('hello from test')).toBeTruthy();
    const sendMsg = posted.find(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as { type?: string }).type === 'chat.send',
    ) as {
      type: string;
      payload: { messages: Array<{ content: string }> };
    };
    expect(sendMsg.payload.messages[0]?.content).toBe('hello from test');
  });

  it('shows assistant line from chat.stream error', async () => {
    render(<ChatApp />);
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

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chat.stream',
          payload: {
            requestId: 'r1',
            event: 'error',
            error: 'Agent loop not wired yet (AGENT-001 pending).',
          },
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Agent loop not wired yet/)).toBeTruthy();
    });
  });

  it('SET-001 opens Settings panel from header button', async () => {
    render(<ChatApp />);
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
      expect(isDisabled(screen.getByTestId('chat-input'))).toBe(false);
    });

    fireEvent.click(screen.getByTestId('chat-settings-btn'));
    expect(screen.getByTestId('settings-panel')).toBeTruthy();
    expect(screen.getByTestId('settings-models-tab')).toBeTruthy();
  });

  it('SET-002 saves model via config.update and hydrates composer', async () => {
    render(<ChatApp />);
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
      expect(isDisabled(screen.getByTestId('chat-input'))).toBe(false);
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'config.hydrate',
          values: {
            'agent-k.provider.model': 'local-qwen',
            'agent-k.provider.baseUrl': 'http://127.0.0.1:4000',
          },
        },
      }),
    );
    await waitFor(() => {
      expect((screen.getByTestId('chat-model') as HTMLInputElement).value).toBe(
        'local-qwen',
      );
    });

    fireEvent.click(screen.getByTestId('chat-settings-btn'));
    fireEvent.change(screen.getByTestId('settings-model'), {
      target: { value: 'gpt-4o-mini' },
    });
    fireEvent.click(screen.getByTestId('settings-save'));

    const updates = posted.filter(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        (m as { type?: string }).type === 'config.update',
    ) as Array<{ type: string; key: string; value: unknown }>;
    expect(
      updates.some((u) => u.key === 'provider.model' && u.value === 'gpt-4o-mini'),
    ).toBe(true);
  });

});
