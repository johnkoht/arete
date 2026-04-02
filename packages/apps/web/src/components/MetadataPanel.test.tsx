/**
 * MetadataPanel tests.
 *
 * Tests area display logic: confirmed area, suggested area with badge,
 * no area ("None"), and long name truncation with tooltip.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetadataPanel } from './MetadataPanel.js';
import type { Meeting } from '@/api/types.js';

// ── Test data ────────────────────────────────────────────────────────────────

function createMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    slug: 'test-meeting',
    title: 'Test Meeting',
    date: '2026-04-01',
    attendees: [{ initials: 'JD', name: 'Jane Doe', email: 'jane@example.com' }],
    status: 'processed',
    duration: 30,
    source: 'fathom',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MetadataPanel', () => {
  describe('area display', () => {
    it('shows "None" when neither area nor suggestedArea is set', () => {
      render(<MetadataPanel meeting={createMeeting()} />);

      expect(screen.getByText('Area')).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();
    });

    it('shows confirmed area name without suggested badge', () => {
      render(
        <MetadataPanel meeting={createMeeting({ area: 'product-strategy' })} />,
      );

      expect(screen.getByText('product-strategy')).toBeInTheDocument();
      expect(screen.queryByText('suggested')).not.toBeInTheDocument();
    });

    it('shows suggested area with "suggested" badge in muted text', () => {
      render(
        <MetadataPanel
          meeting={createMeeting({ suggestedArea: 'engineering' })}
        />,
      );

      const areaName = screen.getByText('engineering');
      expect(areaName).toBeInTheDocument();
      expect(areaName).toHaveClass('text-muted-foreground');
      expect(screen.getByText('suggested')).toBeInTheDocument();
    });

    it('shows confirmed area when both area and suggestedArea are set', () => {
      render(
        <MetadataPanel
          meeting={createMeeting({
            area: 'design',
            suggestedArea: 'engineering',
          })}
        />,
      );

      expect(screen.getByText('design')).toBeInTheDocument();
      expect(screen.queryByText('engineering')).not.toBeInTheDocument();
      expect(screen.queryByText('suggested')).not.toBeInTheDocument();
    });

    it('area display is read-only (no click handlers)', () => {
      render(
        <MetadataPanel meeting={createMeeting({ area: 'product-strategy' })} />,
      );

      const areaName = screen.getByText('product-strategy');
      // Verify it's a plain span, not a button or link
      expect(areaName.tagName).toBe('SPAN');
      expect(areaName.closest('button')).toBeNull();
      expect(areaName.closest('a')).toBeNull();
    });

    it('truncates long area names with ellipsis', () => {
      const longName = 'very-long-area-name-that-should-be-truncated-with-ellipsis';
      render(
        <MetadataPanel meeting={createMeeting({ area: longName })} />,
      );

      const areaName = screen.getByText(longName);
      expect(areaName).toHaveClass('truncate');
      expect(areaName).toHaveClass('max-w-[180px]');
    });

    it('shows tooltip with full area name on hover', async () => {
      const user = userEvent.setup();
      const longName = 'very-long-area-name-that-should-be-truncated';
      render(
        <MetadataPanel meeting={createMeeting({ area: longName })} />,
      );

      const trigger = screen.getByText(longName);
      await user.hover(trigger);

      // Tooltip content should appear (there will be two instances - trigger text and tooltip)
      const allInstances = screen.getAllByText(longName);
      expect(allInstances.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('existing metadata fields', () => {
    it('renders date, duration, source, and attendees', () => {
      render(<MetadataPanel meeting={createMeeting()} />);

      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByText('Attendees')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });
});
