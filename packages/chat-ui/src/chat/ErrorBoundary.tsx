/**
 * ErrorBoundary — webview crash를 화면에 표시 (빈 패널/무반응 방지)
 */
import React from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Agent K] UI crash', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            color: '#f87171',
            fontFamily: 'var(--vscode-font-family, sans-serif)',
            fontSize: 13,
            whiteSpace: 'pre-wrap'
          }}
        >
          <strong>Agent K UI crashed</strong>
          <p style={{ marginTop: 8 }}>{this.state.error.message}</p>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Run <code>npm run compile</code> then press F5 (Extension Development Host).
          </p>
          <button
            type="button"
            style={{ marginTop: 12, padding: '6px 12px', cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
