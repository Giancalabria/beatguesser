import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ui]', error, info);
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="min-h-dvh grid place-items-center p-6">
          <div className="screen-panel max-w-md text-center">
            <h1 className="text-2xl font-bold text-white">Algo salió mal</h1>
            <p className="mt-3 text-neutral-400">
              Recargá la aplicación para volver a intentarlo.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 w-full h-11 rounded-xl bg-easy px-5 text-sm font-semibold text-bg"
            >
              Recargar
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
