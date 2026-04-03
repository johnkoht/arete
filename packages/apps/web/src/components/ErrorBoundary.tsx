/**
 * Reusable error boundary component for graceful error handling.
 *
 * Uses react-error-boundary for simpler implementation than class components.
 * Displays "Something went wrong" message with retry button on error.
 * Logs errors with structured format including component stack.
 */


import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Error Fallback Component ─────────────────────────────────────────────────

function ErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. Please try again.
      </p>
      <div className="mt-4">
        <Button onClick={resetErrorBoundary} variant="outline" size="sm">
          Try again
        </Button>
      </div>
    </div>
  );
}

// ── Error Boundary Wrapper ───────────────────────────────────────────────────

export interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        console.error({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
        });
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
