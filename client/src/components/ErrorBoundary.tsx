import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error);
      console.error("Error info:", errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === "development";

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h2>

            <p className="text-gray-600 text-center mb-6">
              We encountered an unexpected error. Please try refreshing the page
              or contact support if the problem persists.
            </p>

            {/* Show error details only in development */}
            {isDevelopment && this.state.error && (
              <div className="w-full p-4 rounded bg-muted overflow-auto mb-6 border border-destructive/20">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Error Details (Development Only):
                </p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
                  {this.state.error.message}
                </pre>
                {this.state.error.stack && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono mt-2 opacity-75">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-semibold",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer transition-opacity"
              )}
            >
              <RotateCcw size={18} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
