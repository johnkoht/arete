/**
 * arete index — re-index the qmd search collection
 */
import type { Command } from 'commander';
/**
 * Parse vector count from qmd status output.
 * Looks for a line like "Vectors: 79 embedded" and returns the number.
 * Returns undefined if the line is not found or parsing fails.
 */
export declare function parseVectorCount(statusOutput: string): number | undefined;
export declare function registerIndexSearchCommand(program: Command): void;
//# sourceMappingURL=index-search.d.ts.map