/**
 * Human-readable CLI output formatting for meeting reconciliation results.
 */
import chalk from 'chalk';
/**
 * Format a relevance tier as a colored badge for CLI output.
 * HIGH = green, NORMAL = yellow, LOW = red.
 */
export function formatTierBadge(tier) {
    switch (tier) {
        case 'high': return chalk.green('[HIGH]');
        case 'normal': return chalk.yellow('[NORMAL]');
        case 'low': return chalk.red('[LOW]');
    }
}
/**
 * Get a display label for a reconciled item.
 * Extracts description text from action items or uses string directly.
 */
export function getReconciledItemText(item) {
    if (typeof item.original === 'string')
        return item.original;
    return item.original.description;
}
/**
 * Display reconciliation details: per-item tier badges, duplicate annotations, and stats summary.
 */
export function displayReconciliationDetails(result, reconciled) {
    // Display completed matches (from staged processing)
    if (reconciled.length > 0) {
        displayReconciledCompletedItems(reconciled);
    }
    // Display all reconciled items with tier badges and annotations
    const nonKeepItems = result.items.filter((i) => i.status !== 'keep');
    if (nonKeepItems.length > 0 || result.items.some((i) => i.relevanceTier !== 'normal')) {
        console.log('');
        console.log(chalk.bold('Cross-Meeting Reconciliation'));
        console.log(chalk.dim('─'.repeat(40)));
        for (const item of result.items) {
            const badge = formatTierBadge(item.relevanceTier);
            const text = getReconciledItemText(item);
            const truncated = text.length > 60 ? text.slice(0, 57) + '...' : text;
            let annotation = '';
            if (item.status === 'duplicate' && item.annotations.duplicateOf) {
                annotation = chalk.dim(` Duplicate of: ${item.annotations.duplicateOf}`);
            }
            else if (item.status === 'completed' && item.annotations.completedOn) {
                annotation = chalk.dim(` Completed: ${item.annotations.completedOn}`);
            }
            else if (item.status === 'irrelevant') {
                annotation = chalk.dim(' (irrelevant)');
            }
            const statusIcon = item.status === 'keep'
                ? chalk.green('✓')
                : item.status === 'duplicate'
                    ? chalk.yellow('≈')
                    : item.status === 'completed'
                        ? chalk.green('✓')
                        : chalk.red('✗');
            console.log(`  ${statusIcon} ${badge} ${truncated}${annotation}`);
        }
    }
    // Stats summary
    const { stats } = result;
    console.log('');
    console.log(chalk.bold('Reconciliation:') +
        ` ${stats.duplicatesRemoved} duplicates, ${stats.completedMatched} completed, ${stats.lowRelevanceCount} low-relevance`);
}
/**
 * Display reconciled completed items (action items matched to already-done tasks).
 */
export function displayReconciledCompletedItems(reconciled) {
    console.log('');
    console.log(chalk.bold('Reconciled Action Items'));
    console.log(chalk.dim('─'.repeat(40)));
    for (const item of reconciled) {
        console.log(`  ${chalk.green('✓')} ${item.id}: Already done (matched: "${item.matchedText}")`);
    }
}
//# sourceMappingURL=reconciliation-output.js.map