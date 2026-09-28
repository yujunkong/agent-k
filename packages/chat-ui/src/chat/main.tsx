import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';
import { ChatApp } from './ChatApp';
import './chat.css';
// cursor-ui.css @imports workspace-polish / conversation-layout /
// composer-polish / conversation-tabs — do not import them again (V31-UI-04).
import './ui/cursor-ui.css';
import './styles/empty-state.css';
import './components/conversation-variants.css';

const el = document.getElementById('chat-root');
if (!el) {
  document.body.innerHTML =
    '<p style="padding:12px;color:#f87171">#chat-root missing — rebuild extension.</p>';
} else {
  const root = ReactDOM.createRoot(el);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ChatApp />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
