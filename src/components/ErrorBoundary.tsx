import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; errorInfo: string | null; }

/**
 * Production에서 React tree 폴드 대신 에러를 화면에 표시.
 * 흰 화면 디버그용 + 사용자 친화적 fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    this.setState({ errorInfo: info.componentStack ?? null });
    console.error('[ErrorBoundary] caught:', error);
    if (info.componentStack) console.error('[ErrorBoundary] stack:', info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          padding: '32px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fef2f2',
          color: '#7f1d1d',
        }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>
            앱 초기화 중 오류가 발생했습니다
          </h1>
          <p style={{ marginBottom: '12px', fontSize: '14px' }}>
            아래 메시지를 복사해서 GitHub Issues에 등록해주세요.
          </p>
          <pre style={{
            background: '#fff',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '12px',
            overflow: 'auto',
            maxHeight: '400px',
            whiteSpace: 'pre-wrap',
          }}>
            <strong>{this.state.error.name}: {this.state.error.message}</strong>
            {'\n\n'}
            {this.state.error.stack}
            {this.state.errorInfo && '\n\n--- Component stack ---\n' + this.state.errorInfo}
          </pre>
          <button
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            onClick={() => location.reload()}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
