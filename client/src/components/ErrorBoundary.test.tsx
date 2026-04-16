import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.ok(screen.getByText("Success"));
  });

  it("should render fallback UI when error occurs", () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    render(
      <ErrorBoundary>
        <TestComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    assert.ok(screen.getByText(/something went wrong/i));
    
    console.error = originalConsoleError;
  });
});
