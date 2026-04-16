import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  const TestComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error("Test error");
    }
    return <div>Success</div>;
  };

  it("should render children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <TestComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("should render fallback UI when error occurs", () => {
    const originalConsoleError = console.error;
    console.error = vi.fn();

    render(
      <ErrorBoundary>
        <TestComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    
    console.error = originalConsoleError;
  });
});
