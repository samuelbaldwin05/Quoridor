import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time throw and shows something instead of nothing.
 *
 * Without a boundary anywhere in the tree, React unmounts the whole app on an uncaught render
 * error, so the symptom is a blank page with the cause only visible in the console. That is
 * indistinguishable from a hung load, which made a real bug hard to place. The message is
 * deliberately plain and the error text is included, because the person hitting it is usually
 * the one who can report it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the console record: the boundary swallows the throw, and the component stack is
    // usually the only thing that identifies where it came from.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-error" role="alert">
        <h1 className="app-error-title">Something broke</h1>
        <p className="app-error-text">
          The page hit an error and stopped. Reloading usually fixes it.
        </p>
        <p className="app-error-detail">{error.message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
