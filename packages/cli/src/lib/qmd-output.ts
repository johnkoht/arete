/**
 * Shared display helper for QMD refresh results.
 * Used by pull, meeting add, and meeting process commands.
 */

import type { QmdRefreshResult } from '@arete/core';
import { listItem as defaultListItem, warn as defaultWarn } from '../formatters.js';

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
export function displayQmdResult(
  result: QmdRefreshResult | undefined,
  deps: DisplayDeps = {},
): void {
  const _listItem = deps.listItem ?? defaultListItem;
  const _warn = deps.warn ?? defaultWarn;

  if (result && !result.skipped) {
    if (result.indexed) {
      _listItem('Search index', 'qmd index updated');
    }
    if (result.warning) {
      _warn(result.warning);
    }
  }
}
