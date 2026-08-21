/**
 * EXT-002 — webview entry: mount Chat UI shell into #chat-root.
 */

import { createRoot } from 'react-dom/client';
import { Shell } from './Shell';

const rootEl = document.getElementById('chat-root');
if (!rootEl) {
  throw new Error('EXT-002: #chat-root missing from webview HTML');
}

createRoot(rootEl).render(<Shell />);
