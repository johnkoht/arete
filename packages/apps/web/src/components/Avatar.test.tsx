/**
 * Avatar component tests.
 *
 * Tests initials computation, size variants, tooltip display, and accessibility.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Avatar } from './Avatar.js';
import { TooltipProvider } from './ui/tooltip.js';

// ── Helper ───────────────────────────────────────────────────────────────────

function renderAvatar(props: { name: string; size?: 'sm' | 'md' }) {
  return render(
    <TooltipProvider>
      <Avatar {...props} />
    </TooltipProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Avatar', () => {
  describe('initials computation', () => {
    it('renders initials from two-word name ("John Doe" → "JD")', () => {
      renderAvatar({ name: 'John Doe' });
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('renders initials from multi-part name using first + last word ("John Paul Doe" → "JD")', () => {
      renderAvatar({ name: 'John Paul Doe' });
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('renders single initial for single word name ("John" → "J")', () => {
      renderAvatar({ name: 'John' });
      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('handles empty name gracefully (shows "?")', () => {
      renderAvatar({ name: '' });
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('handles whitespace-only name gracefully (shows "?")', () => {
      renderAvatar({ name: '   ' });
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('renders initials in uppercase', () => {
      renderAvatar({ name: 'john doe' });
      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('renders size "sm" as 24px (h-6 w-6)', () => {
      renderAvatar({ name: 'John Doe', size: 'sm' });
      const avatar = screen.getByLabelText('John Doe');
      expect(avatar).toHaveClass('h-6', 'w-6');
    });

    it('renders size "md" (default) as 32px (h-8 w-8)', () => {
      renderAvatar({ name: 'John Doe', size: 'md' });
      const avatar = screen.getByLabelText('John Doe');
      expect(avatar).toHaveClass('h-8', 'w-8');
    });

    it('defaults to "md" size when not specified', () => {
      renderAvatar({ name: 'John Doe' });
      const avatar = screen.getByLabelText('John Doe');
      expect(avatar).toHaveClass('h-8', 'w-8');
    });
  });

  describe('tooltip', () => {
    it('shows tooltip with full name on hover', async () => {
      const user = userEvent.setup();
      renderAvatar({ name: 'John Doe' });

      const avatar = screen.getByLabelText('John Doe');
      await user.hover(avatar);

      // Tooltip content should appear
      expect(await screen.findByRole('tooltip')).toHaveTextContent('John Doe');
    });
  });

  describe('accessibility', () => {
    it('has accessible label via aria-label', () => {
      renderAvatar({ name: 'John Doe' });
      expect(screen.getByLabelText('John Doe')).toBeInTheDocument();
    });

    it('uses fallback aria-label for empty name', () => {
      renderAvatar({ name: '' });
      expect(screen.getByLabelText('Unknown')).toBeInTheDocument();
    });
  });
});
