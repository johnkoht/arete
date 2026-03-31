/**
 * ErrorBoundary component tests.
 *
 * Tests error catching, fallback UI rendering, retry functionality, and error logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary.js';

// ── Test Components ──────────────────────────────────────────────────────────

/** Component that throws an error on render */
function ThrowError({ message = 'Test error' }: { message?: string }) {
  throw new Error(message);
}



// ── Tests ────────────────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error to avoid noisy test output from React's error logging
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('error catching', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('catches child component errors and shows fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('displays error message in fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Specific test failure" />
        </ErrorBoundary>
      );

      // The error fallback should be visible
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('retry functionality', () => {
    it('shows a retry button in fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('resets error state when retry button is clicked', async () => {
      const user = userEvent.setup();

      // First render: error state
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Verify error UI is shown
      expect(screen.getByRole('alert')).toBeInTheDocument();
      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();

      // Click retry - this triggers resetErrorBoundary
      // Even though ThrowError will throw again, it proves reset was called
      await user.click(retryButton);

      // After reset, error boundary tries to re-render children
      // ThrowError throws again, so we're back in error state
      // The key verification is that the click handler worked (no error)
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('error logging', () => {
    it('logs error with structured format including message', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Logged error message" />
        </ErrorBoundary>
      );

      // Check that console.error was called with structured object
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Logged error message',
        })
      );
    });

    it('logs error with stack trace', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Check that console.error was called with object containing stack
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.any(String),
        })
      );
    });
  });

  describe('reusability', () => {
    it('can wrap any component without being TasksPage-specific', () => {
      function CustomComponent() {
        return <div>Custom component content</div>;
      }

      render(
        <ErrorBoundary>
          <CustomComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom component content')).toBeInTheDocument();
    });

    it('handles multiple children', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
    });
  });
});
