/**
 * Formatter for reconciliation results.
 *
 * Displays reconciled items grouped by relevance tier with annotations,
 * and a stats summary showing filtered items. Pure formatting — no
 * business logic.
 */

import type {
  ReconciliationResult,
  ReconciledItem,
  ReconciliationActionItem,
} from '@arete/core';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Dependency injection for testability
// ---------------------------------------------------------------------------

export interface ReconciliationOutputDeps {
  log?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_ORDER: ReadonlyArray<ReconciledItem['relevanceTier']> = ['high', 'normal', 'low'];

const TIER_LABELS: Record<ReconciledItem['relevanceTier'], string> = {
  high: 'HIGH',
  normal: 'NORMAL',
  low: 'LOW',
};

function tierTag(tier: ReconciledItem['relevanceTier']): string {
  const label = TIER_LABELS[tier];
  switch (tier) {
    case 'high':
      return chalk.red(`[${label}]`);
    case 'normal':
      return chalk.yellow(`[${label}]`);
    case 'low':
      return chalk.dim(`[${label}]`);
  }
}

/**
 * Build the display line for a single reconciled item.
 *
 * Format: `- <id>: [TIER] [@owner → @counterparty] Description (area: slug)`
 *
 * For non-action items (decisions/learnings) the owner/counterparty prefix is
 * omitted and the original string is used directly.
 */
export function formatReconciledItemLine(item: ReconciledItem): string {
  const tag = tierTag(item.relevanceTier);
  const areaAnnotation = item.annotations.areaSlug
    ? chalk.dim(` (area: ${item.annotations.areaSlug})`)
    : '';
  const projectAnnotation =
    !item.annotations.areaSlug && item.annotations.projectSlug
      ? chalk.dim(` (project: ${item.annotations.projectSlug})`)
      : '';

  if (typeof item.original === 'string') {
    // Decision or learning — plain text
    return `- ${tag} ${item.original}${areaAnnotation}${projectAnnotation}`;
  }

  // Action item — structured
  const action = item.original as ReconciliationActionItem;
  const arrow = action.direction === 'i_owe_them' ? '→' : '←';
  const counterparty = action.counterpartySlug ? ` ${arrow} @${action.counterpartySlug}` : '';
  const ownerPrefix = `[@${action.ownerSlug}${counterparty}]`;

  return `- ${tag} ${ownerPrefix} ${action.description}${areaAnnotation}${projectAnnotation}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a ReconciliationResult for human-readable CLI output.
 *
 * Returns the formatted string (does not print). Use `displayReconciliationResult`
 * for direct console output.
 */
export function formatReconciliationResult(result: ReconciliationResult): string {
  const kept = result.items.filter((i) => i.status === 'keep');
  const filtered = result.items.length - kept.length;

  const lines: string[] = [];

  // Header
  lines.push(chalk.bold(`Staged Items (${kept.length} shown, ${filtered} filtered)`));
  lines.push('');

  // Group kept items by tier
  for (const tier of TIER_ORDER) {
    const tierItems = kept.filter((i) => i.relevanceTier === tier);
    if (tierItems.length === 0) continue;

    lines.push(chalk.bold(`${TIER_LABELS[tier]} Relevance`));
    for (const item of tierItems) {
      lines.push(formatReconciledItemLine(item));
    }
    lines.push('');
  }

  if (kept.length === 0) {
    lines.push(chalk.dim('  No items to show.'));
    lines.push('');
  }

  // Stats summary
  lines.push(chalk.dim('─'.repeat(40)));

  const statParts: string[] = [];
  if (result.stats.duplicatesRemoved > 0) {
    statParts.push(`${result.stats.duplicatesRemoved} duplicates`);
  }
  if (result.stats.lowRelevanceCount > 0) {
    statParts.push(`${result.stats.lowRelevanceCount} low-relevance`);
  }
  if (result.stats.completedMatched > 0) {
    statParts.push(`${result.stats.completedMatched} completed`);
  }

  const statsLine =
    statParts.length > 0
      ? `Stats: ${statParts.join(', ')}`
      : 'Stats: all items shown';

  lines.push(statsLine);

  return lines.join('\n');
}

/**
 * Print a ReconciliationResult to the console.
 */
export function displayReconciliationResult(
  result: ReconciliationResult,
  deps: ReconciliationOutputDeps = {},
): void {
  const _log = deps.log ?? console.log;
  _log(formatReconciliationResult(result));
}
