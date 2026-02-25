/**
 * Shared display helper for QMD refresh results.
 * Used by pull, meeting add, and meeting process commands.
 */
import { listItem as defaultListItem, warn as defaultWarn } from '../formatters.js';
/**
 * Display a QMD refresh result to the console.
 *
 * When `result` is undefined or skipped, produces no output.
 * Otherwise prints an index-updated list item and/or a warning.
 *
 * @param result - The QMD refresh result (may be undefined)
 * @param deps - Injectable formatters for testing; defaults to real CLI formatters
 */
export function displayQmdResult(result, deps = {}) {
    const _listItem = deps.listItem ?? defaultListItem;
    const _warn = deps.warn ?? defaultWarn;
    if (result && !result.skipped) {
        if (result.indexed) {
            if (result.embedded) {
                _listItem('Search index', 'updated and embedded');
            }
            else {
                _listItem('Search index', 'updated');
            }
        }
        if (result.warning) {
            _warn(result.warning);
        }
        if (result.embedWarning) {
            _warn(result.embedWarning);
        }
        // { indexed: false, skipped: false, warning: undefined } is intentionally silent.
        // This state means qmd update ran and exited cleanly but reported no indexed files
        // (e.g. collection exists but zero .md files changed). No user action is needed.
    }
}
//# sourceMappingURL=qmd-output.js.map