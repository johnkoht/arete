/**
 * Shared display helper for QMD refresh results.
 * Used by pull, meeting add, and meeting process commands.
 */
import type { QmdRefreshResult } from '@arete/core';
interface DisplayDeps {
    listItem?: (label: string, value: string) => void;
    warn?: (msg: string) => void;
}
/**
 * Display a QMD refresh result to the console.
 *
 * When `result` is undefined or skipped, produces no output.
 * Otherwise prints an index-updated list item and/or a warning.
 *
 * @param result - The QMD refresh result (may be undefined)
 * @param deps - Injectable formatters for testing; defaults to real CLI formatters
 */
export declare function displayQmdResult(result: QmdRefreshResult | undefined, deps?: DisplayDeps): void;
export {};
//# sourceMappingURL=qmd-output.d.ts.map