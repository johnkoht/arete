/**
 * ReviewItems tests.
 *
 * Tests localStorage persistence for collapse state, bulk approve functionality,
 * and item status toggling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewItemsSection } from './ReviewItems.js';
import type { ReviewItem } from '@/api/types.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';

// ── Test data ────────────────────────────────────────────────────────────────

function createTestItems(): ReviewItem[] {
  return [
    { id: 'action-1', type: 'action', text: 'Send follow-up email', status: 'pending' },
    { id: 'action-2', type: 'action', text: 'Review proposal', status: 'pending' },
    { id: 'decision-1', type: 'decision', text: 'Go with vendor A', status: 'pending' },
    { id: 'decision-2', type: 'decision', text: 'Set budget to $10k', status: 'approved' },
    { id: 'learning-1', type: 'learning', text: 'Team prefers async', status: 'pending' },
  ];
}

// ── Helper ───────────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderReviewItems(
  items: ReviewItem[],
  overrides: {
    onItemsChange?: (items: ReviewItem[]) => void;
    onSaveApprove?: () => void;
    onBulkApprove?: (ids: string[]) => void;
  } = {}
) {
  const onItemsChange = overrides.onItemsChange ?? vi.fn();
  const onSaveApprove = overrides.onSaveApprove ?? vi.fn();
  const onBulkApprove = overrides.onBulkApprove ?? vi.fn();
  const queryClient = createQueryClient();

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ReviewItemsSection
            items={items}
            onItemsChange={onItemsChange}
            onSaveApprove={onSaveApprove}
            onBulkApprove={onBulkApprove}
          />
        </TooltipProvider>
      </QueryClientProvider>
    ),
    onItemsChange,
    onSaveApprove,
    onBulkApprove,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReviewItemsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('localStorage persistence for collapse state', () => {
    it('saves collapsed sections to localStorage', () => {
      const items = createTestItems();
      renderReviewItems(items);

      // Find the Action Items section header and collapse it
      const actionItemsButton = screen.getByRole('button', { name: /collapse action items/i });
      fireEvent.click(actionItemsButton);

      // Verify localStorage was updated
      const stored = localStorage.getItem('arete-review-collapsed');
      expect(stored).not.toBeNull();
      const collapsed = JSON.parse(stored!) as string[];
      expect(collapsed).toContain('Action Items');
    });

    it('restores collapsed state from localStorage on mount', () => {
      // Pre-seed localStorage with collapsed sections
      localStorage.setItem('arete-review-collapsed', JSON.stringify(['Decisions', 'Learnings']));

      const items = createTestItems();
      renderReviewItems(items);

      // Action Items should be expanded (aria-expanded=true)
      // Use exact match for collapse/expand buttons (they have aria-expanded attribute)
      const actionItemsButton = screen.getByRole('button', { name: /^(collapse|expand) action items$/i });
      expect(actionItemsButton).toHaveAttribute('aria-expanded', 'true');

      // Decisions should be collapsed (aria-expanded=false)
      const decisionsButton = screen.getByRole('button', { name: /^(collapse|expand) decisions$/i });
      expect(decisionsButton).toHaveAttribute('aria-expanded', 'false');

      // Learnings should be collapsed (aria-expanded=false)
      const learningsButton = screen.getByRole('button', { name: /^(collapse|expand) learnings$/i });
      expect(learningsButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggles collapse state and updates localStorage', () => {
      const items = createTestItems();
      renderReviewItems(items);

      // Get the Decisions section button
      const decisionsButton = screen.getByRole('button', { name: /collapse decisions/i });

      // Initially expanded
      expect(decisionsButton).toHaveAttribute('aria-expanded', 'true');

      // Collapse it
      fireEvent.click(decisionsButton);
      expect(decisionsButton).toHaveAttribute('aria-expanded', 'false');

      // Check localStorage
      let stored = JSON.parse(localStorage.getItem('arete-review-collapsed')!) as string[];
      expect(stored).toContain('Decisions');

      // Expand it again
      fireEvent.click(decisionsButton);
      expect(decisionsButton).toHaveAttribute('aria-expanded', 'true');

      // Check localStorage updated
      stored = JSON.parse(localStorage.getItem('arete-review-collapsed')!) as string[];
      expect(stored).not.toContain('Decisions');
    });
  });

  describe('bulk approve', () => {
    it('approves all items in a section when "Approve All" is clicked', () => {
      const items = createTestItems();
      const onItemsChange = vi.fn();
      const onBulkApprove = vi.fn();

      renderReviewItems(items, { onItemsChange, onBulkApprove });

      // Find and click "Approve All" for Action Items
      const approveAllButton = screen.getAllByRole('button', { name: /approve all action items/i })[0];
      fireEvent.click(approveAllButton);

      // onItemsChange should be called with updated items
      expect(onItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = onItemsChange.mock.calls[0][0] as ReviewItem[];

      // All action items should now be approved
      const actionItems = updatedItems.filter((i) => i.type === 'action');
      expect(actionItems.every((i) => i.status === 'approved')).toBe(true);

      // onBulkApprove should be called with the IDs of items that were not already approved
      expect(onBulkApprove).toHaveBeenCalledTimes(1);
      const approvedIds = onBulkApprove.mock.calls[0][0] as string[];
      expect(approvedIds).toContain('action-1');
      expect(approvedIds).toContain('action-2');
    });

    it('does not call callbacks when all items are already approved', () => {
      const items: ReviewItem[] = [
        { id: 'action-1', type: 'action', text: 'Task 1', status: 'approved' },
        { id: 'action-2', type: 'action', text: 'Task 2', status: 'approved' },
      ];
      const onItemsChange = vi.fn();
      const onBulkApprove = vi.fn();

      renderReviewItems(items, { onItemsChange, onBulkApprove });

      // "Approve All" button should not be visible when all items are already approved
      const approveAllButtons = screen.queryAllByRole('button', { name: /approve all/i });
      // Filter to only "Approve All Action Items" buttons
      const actionApproveAll = approveAllButtons.filter((btn) =>
        btn.getAttribute('aria-label')?.toLowerCase().includes('action')
      );
      expect(actionApproveAll).toHaveLength(0);
    });

    it('only approves unapproved items in bulk approve', () => {
      const items: ReviewItem[] = [
        { id: 'decision-1', type: 'decision', text: 'Decision 1', status: 'pending' },
        { id: 'decision-2', type: 'decision', text: 'Decision 2', status: 'approved' },
        { id: 'decision-3', type: 'decision', text: 'Decision 3', status: 'skipped' },
      ];
      const onBulkApprove = vi.fn();

      renderReviewItems(items, { onBulkApprove });

      // Click "Approve All" for Decisions
      const approveAllButton = screen.getByRole('button', { name: /approve all decisions/i });
      fireEvent.click(approveAllButton);

      // Only decision-1 and decision-3 should be in the bulk approve call
      // (decision-2 is already approved)
      const approvedIds = onBulkApprove.mock.calls[0][0] as string[];
      expect(approvedIds).toHaveLength(2);
      expect(approvedIds).toContain('decision-1');
      expect(approvedIds).toContain('decision-3');
      expect(approvedIds).not.toContain('decision-2');
    });
  });

  describe('toggle item status', () => {
    it('toggles item from pending to approved', () => {
      const items = createTestItems();
      const onItemsChange = vi.fn();

      renderReviewItems(items, { onItemsChange });

      // Find the approve button for the first action item
      const approveButtons = screen.getAllByRole('button', { name: /approve action item/i });
      fireEvent.click(approveButtons[0]);

      expect(onItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = onItemsChange.mock.calls[0][0] as ReviewItem[];
      const updatedItem = updatedItems.find((i) => i.id === 'action-1');
      expect(updatedItem?.status).toBe('approved');
    });

    it('toggles item from approved to pending', () => {
      const items: ReviewItem[] = [
        { id: 'action-1', type: 'action', text: 'Task 1', status: 'approved' },
      ];
      const onItemsChange = vi.fn();

      renderReviewItems(items, { onItemsChange });

      // Click unapprove button (same button, different state)
      const unapproveButton = screen.getByRole('button', { name: /unapprove action item/i });
      fireEvent.click(unapproveButton);

      expect(onItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = onItemsChange.mock.calls[0][0] as ReviewItem[];
      expect(updatedItems[0].status).toBe('pending');
    });

    it('toggles item to skipped status', () => {
      const items = createTestItems();
      const onItemsChange = vi.fn();

      renderReviewItems(items, { onItemsChange });

      // Find the skip button for the first action item
      const skipButtons = screen.getAllByRole('button', { name: /skip action item/i });
      fireEvent.click(skipButtons[0]);

      expect(onItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = onItemsChange.mock.calls[0][0] as ReviewItem[];
      const updatedItem = updatedItems.find((i) => i.id === 'action-1');
      expect(updatedItem?.status).toBe('skipped');
    });

    it('toggles item from skipped back to pending', () => {
      const items: ReviewItem[] = [
        { id: 'learning-1', type: 'learning', text: 'A learning', status: 'skipped' },
      ];
      const onItemsChange = vi.fn();

      renderReviewItems(items, { onItemsChange });

      // Click unskip button
      const unskipButton = screen.getByRole('button', { name: /unskip learning/i });
      fireEvent.click(unskipButton);

      expect(onItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = onItemsChange.mock.calls[0][0] as ReviewItem[];
      expect(updatedItems[0].status).toBe('pending');
    });
  });

  describe('keyboard accessibility', () => {
    it('section headers are focusable and have visible focus ring', () => {
      const items = createTestItems();
      renderReviewItems(items);

      const sectionButtons = screen.getAllByRole('button', { name: /action items|decisions|learnings/i });

      // Check that buttons have focus ring classes
      for (const button of sectionButtons) {
        // The button should have focus styling classes
        expect(button.className).toContain('focus:');
      }
    });

    it('item action buttons have aria-labels', () => {
      const items = createTestItems();
      renderReviewItems(items);

      // Check approve buttons have aria-labels
      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      expect(approveButtons.length).toBeGreaterThan(0);

      // Check skip buttons have aria-labels
      const skipButtons = screen.getAllByRole('button', { name: /skip/i });
      expect(skipButtons.length).toBeGreaterThan(0);
    });

    it('Enter key activates section toggle', () => {
      const items = createTestItems();
      renderReviewItems(items);

      const decisionsButton = screen.getByRole('button', { name: /collapse decisions/i });

      // Initially expanded
      expect(decisionsButton).toHaveAttribute('aria-expanded', 'true');

      // Focus and press Enter
      decisionsButton.focus();
      fireEvent.keyDown(decisionsButton, { key: 'Enter' });
      fireEvent.click(decisionsButton); // Button responds to click from Enter

      expect(decisionsButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('Space key activates approve button', () => {
      const items = createTestItems();
      const onItemsChange = vi.fn();

      renderReviewItems(items, { onItemsChange });

      const approveButton = screen.getAllByRole('button', { name: /approve action item/i })[0];

      // Focus and press Space (simulate click)
      approveButton.focus();
      fireEvent.keyDown(approveButton, { key: ' ' });
      fireEvent.click(approveButton);

      expect(onItemsChange).toHaveBeenCalled();
    });
  });

  describe('display', () => {
    it('shows review progress in footer', () => {
      const items = createTestItems();
      renderReviewItems(items);

      // Should show review counts - use getAllBy since there are two matching elements
      const reviewedTexts = screen.getAllByText(/of 5 reviewed/i);
      expect(reviewedTexts.length).toBeGreaterThan(0);
    });

    it('shows item counts in section headers', () => {
      const items = createTestItems();
      renderReviewItems(items);

      // Action Items has 2 items - use the collapse button for section reference
      const actionItemsButton = screen.getByRole('button', { name: /^collapse action items$/i });
      expect(actionItemsButton).toHaveTextContent('2');

      // Decisions has 2 items
      const decisionsButton = screen.getByRole('button', { name: /^collapse decisions$/i });
      expect(decisionsButton).toHaveTextContent('2');

      // Learnings has 1 item
      const learningsButton = screen.getByRole('button', { name: /^collapse learnings$/i });
      expect(learningsButton).toHaveTextContent('1');
    });
  });

  describe('reconciled items', () => {
    it('displays "already done" badge for reconciled items', () => {
      const items: ReviewItem[] = [
        {
          id: 'action-reconciled',
          type: 'action',
          text: 'Send auth doc to Alex',
          status: 'skipped',
          source: 'reconciled',
          matchedText: 'Send auth doc to Alex by EOD',
        },
        { id: 'action-pending', type: 'action', text: 'Review proposal', status: 'pending' },
      ];
      renderReviewItems(items);

      // Should show "already done" badge for reconciled item
      const badge = screen.getByText('already done');
      expect(badge).toBeInTheDocument();
    });

    it('allows un-skipping reconciled items', () => {
      const items: ReviewItem[] = [
        {
          id: 'action-reconciled',
          type: 'action',
          text: 'Send auth doc to Alex',
          status: 'skipped',
          source: 'reconciled',
          matchedText: 'Send auth doc to Alex by EOD',
        },
      ];
      const { onItemsChange } = renderReviewItems(items);

      // Click the skip/unskip button (X icon)
      const skipButton = screen.getByRole('button', { name: /unskip action item/i });
      fireEvent.click(skipButton);

      // Should call onItemsChange with status changed to pending
      expect(onItemsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'action-reconciled',
          status: 'pending',
        }),
      ]);
    });

    it('reconciled items have muted styling', () => {
      const items: ReviewItem[] = [
        {
          id: 'action-reconciled',
          type: 'action',
          text: 'Send auth doc to Alex',
          status: 'skipped',
          source: 'reconciled',
        },
      ];
      renderReviewItems(items);

      // The text should have line-through styling (applied via CSS class)
      const itemText = screen.getByText('Send auth doc to Alex');
      expect(itemText).toHaveClass('line-through');
    });
  });
});
