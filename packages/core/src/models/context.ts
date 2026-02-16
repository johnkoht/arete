/**
 * Context domain types.
 *
 * Imports from common.ts ONLY.
 */

import type { ProductPrimitive, WorkType } from './common.js';

/** A file reference with content assembled during context injection */
export type ContextFile = {
  path: string;
  relativePath: string;
  primitive?: ProductPrimitive;
  category: 'context' | 'goals' | 'projects' | 'people' | 'resources' | 'memory';
  summary?: string;
  content?: string;
  relevanceScore?: number;
};

/** Gap identified during context assembly */
export type ContextGap = {
  primitive?: ProductPrimitive;
  description: string;
  suggestion?: string;
};

/** Result of context injection — the assembled context bundle */
export type ContextBundle = {
  query: string;
  primitives: ProductPrimitive[];
  files: ContextFile[];
  gaps: ContextGap[];
  confidence: 'High' | 'Medium' | 'Low';
  assembledAt: string;
};

/** Request for context assembly (replaces ContextInjectionOptions with richer API) */
export type ContextRequest = {
  query: string;
  primitives?: ProductPrimitive[];
  workType?: WorkType;
  maxFiles?: number;
  minScore?: number;
};

/** Inventory of available context files in the workspace */
export type ContextInventory = {
  files: ContextFile[];
  totalFiles: number;
  byCategory: Record<string, number>;
  scannedAt: string;
};

/** Options for getRelevantContext (backward-compatible alias) */
export type ContextInjectionOptions = {
  primitives?: ProductPrimitive[];
  workType?: WorkType;
  maxFiles?: number;
  minScore?: number;
};
