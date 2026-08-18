import { useEffect, useRef } from 'react';

export type HostMessage = { type?: string; [key: string]: unknown };

export type HostMessageHandlers = {
  [type: string]: (data: HostMessage) => void;
};

/**
 * Single window `message` listener. Handler map is read from a ref so ChatApp
 * can pass a fresh object each render without resubscribing.
 */
export function useHostMessages(handlers: HostMessageHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const type = (data as HostMessage).type;
      if (typeof type !== 'string' || !type) return;
      handlersRef.current[type]?.(data as HostMessage);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
}
