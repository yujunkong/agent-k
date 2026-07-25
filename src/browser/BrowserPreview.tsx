/**
 * BrowserPreview — Webview에서 브라우저 미리보기 (C7-T06)
 *
 * iframe 또는 캔버스 스트리밍으로 브라우저 화면 표시
 * BrowserSessionManager와 연동
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BrowserSessionInfo } from '../browser/BrowserSession';

interface BrowserPreviewProps {
  sessionId: string;
  sessionInfo: BrowserSessionInfo | null;
  onNavigate: (url: string) => void;
  onScreenshotRefresh: () => Promise<string | null>;
  isConnected: boolean;
}

export function BrowserPreview({ sessionId, sessionInfo, onNavigate, onScreenshotRefresh, isConnected }: BrowserPreviewProps) {
  const [url, setUrl] = useState(sessionInfo?.url ?? 'about:blank');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync URL from session info
  useEffect(() => {
    if (sessionInfo) {
      setUrl(sessionInfo.url);
    }
  }, [sessionInfo?.url]);

  // Periodic screenshot refresh (polling — 2s)
  useEffect(() => {
    if (!isConnected) return;

    refreshInterval.current = setInterval(async () => {
      const shot = await onScreenshotRefresh();
      if (shot) {
        setScreenshot(shot);
        setError(null);
      }
    }, 2000);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [isConnected, sessionId]);

  const handleNavigate = () => {
    if (!url.trim()) return;
    setLoading(true);
    onNavigate(url.trim());
    // Loading will be cleared by screenshot refresh
    setTimeout(() => setLoading(false), 3000);
  };

  const handleRefresh = async () => {
    setLoading(true);
    const shot = await onScreenshotRefresh();
    if (shot) setScreenshot(shot);
    setLoading(false);
  };

  if (!isConnected) {
    return (
      <div style={{
        padding: 16, textAlign: 'center', opacity: 0.5,
        border: '1px dashed var(--vscode-panel-border, #555)',
        borderRadius: 6, marginBottom: 8
      }}>
        <p>🔌 No active browser session</p>
        <p style={{ fontSize: '0.85em', marginTop: 4 }}>
          Create a session first with <code>browser_navigate</code>
        </p>
      </div>
    );
  }

  return (
    <div className="browser-preview" style={{
      border: '1px solid var(--vscode-panel-border, #333)',
      borderRadius: 6, marginBottom: 8, overflow: 'hidden'
    }}>
      {/* Navigation bar */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 8px',
        background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
        borderBottom: '1px solid var(--vscode-panel-border, #333)'
      }}>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleNavigate()}
          placeholder="Enter URL..."
          style={{
            flex: 1, padding: '4px 8px', borderRadius: 4,
            border: '1px solid var(--vscode-input-border, #555)',
            background: 'var(--vscode-input-background, #3c3c3c)',
            color: 'var(--vscode-input-foreground, #ccc)',
            fontSize: '0.85em'
          }}
        />
        <button onClick={handleNavigate} disabled={loading}
          style={{
            padding: '4px 12px', borderRadius: 4,
            background: loading ? 'var(--vscode-button-secondaryBackground, #5a5a5a)' : 'var(--vscode-button-background, #0078d4)',
            color: 'var(--vscode-button-foreground, #fff)',
            border: 'none', cursor: 'pointer', fontSize: '0.85em'
          }}>
          {loading ? '⏳' : 'Go'}
        </button>
        <button onClick={handleRefresh} disabled={loading}
          style={{
            padding: '4px 8px', borderRadius: 4,
            background: 'transparent',
            border: '1px solid var(--vscode-panel-border, #555)',
            cursor: 'pointer', fontSize: '0.85em'
          }}>
          🔄
        </button>
      </div>

      {/* Screenshot display */}
      <div style={{
        position: 'relative', minHeight: 200,
        background: 'var(--vscode-editor-background, #1e1e1e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', zIndex: 10
          }}>
            <span>Loading...</span>
          </div>
        )}
        {screenshot ? (
          <img src={`data:image/png;base64,${screenshot}`} alt="Browser preview"
            style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }} />
        ) : (
          <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>
            <p style={{ fontSize: '2em', marginBottom: 8 }}>🌐</p>
            <p>Waiting for screenshot...</p>
          </div>
        )}
        {error && <div style={{ color: '#ef4444', fontSize: '0.8em', padding: 4 }}>{error}</div>}
      </div>

      {/* Status bar */}
      <div style={{
        padding: '4px 8px', fontSize: '0.75em', opacity: 0.6,
        borderTop: '1px solid var(--vscode-panel-border, #333)',
        display: 'flex', justifyContent: 'space-between'
      }}>
        <span>Session: {sessionId.slice(0, 20)}...</span>
        {sessionInfo && <span>{sessionInfo.title}</span>}
      </div>
    </div>
  );
}
