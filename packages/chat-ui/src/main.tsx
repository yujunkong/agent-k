/**
 * EXT-002 entry kept as ChatApp mount (CHAT-001 shell).
 */

import { createRoot } from 'react-dom/client';
import { ChatApp } from './ChatApp';

const rootEl = document.getElementById('chat-root');
if (!rootEl) {
  throw new Error('CHAT-001: #chat-root missing from webview HTML');
}

createRoot(rootEl).render(<ChatApp />);
