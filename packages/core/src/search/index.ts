/**
 * Search barrel export.
 */

export type { SearchMatchType, SearchOptions, SearchProvider, SearchResult } from './types.js';
export { tokenize, STOP_WORDS } from './tokenize.js';
export { getSearchProvider } from './factory.js';
export { parseQmdJson, QMD_PROVIDER_NAME, getSearchProvider as getQmdSearchProvider } from './providers/qmd.js';
export { FALLBACK_PROVIDER_NAME, getSearchProvider as getFallbackSearchProvider } from './providers/fallback.js';
export { ensureQmdCollection, generateCollectionName, refreshQmdIndex, embedQmdIndex } from './qmd-setup.js';
export type { QmdSetupResult, QmdSetupDeps, QmdRefreshResult, QmdEmbedResult } from './qmd-setup.js';
