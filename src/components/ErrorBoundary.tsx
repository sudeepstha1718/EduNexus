import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
  };

  public render() {
    const self = this as any;
    if (self.state.hasError) {
      return (
        <div className="min-h-[300px] p-6 flex flex-col items-center justify-center text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg mx-auto my-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[var(--ink)] mb-1">
            {self.props.fallbackTitle || 'Session Interrupted'}
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mb-4 leading-relaxed">
            A temporary view issue occurred. Your progress and student credentials are safely preserved.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="btn btn-primary text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resume View</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn text-xs py-2 px-4 rounded-xl border border-[var(--border)]"
            >
              <span>Reload Page</span>
            </button>
          </div>
        </div>
      );
    }

    return self.props.children;
  }
}
