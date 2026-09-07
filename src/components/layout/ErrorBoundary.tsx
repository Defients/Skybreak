import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = (): void => {
    localStorage.removeItem("skybreak_autosave");
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-spire-bg p-8">
          <div className="glass-panel p-8 max-w-lg text-center space-y-4">
            <div className="text-5xl">💀</div>
            <h1 className="text-2xl font-display gold-text">A Fatal Error Occurred</h1>
            <p className="text-spire-muted text-sm">
              The Astrilith has claimed your party. The error has been logged to the console.
            </p>
            {this.state.error && (
              <pre className="text-xs text-spire-danger/80 bg-spire-bg/60 p-3 rounded-lg overflow-x-auto text-left border border-spire-border/40">
                {this.state.error.message}
              </pre>
            )}
            <button
              className="btn-gold px-6 py-2.5"
              onClick={this.handleReset}
            >
              Clear Autosave & Restart
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
