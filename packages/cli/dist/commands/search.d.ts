/**
 * Search command — unified semantic search across workspace.
 *
 * Replaces fragmented `context --for`, `memory search`, and `memory timeline` commands
 * with a single `arete search` command supporting scope filtering via QMD collections.
 *
 * Output schemas (see dev/work/plans/consolidate-search-command/design-notes.md):
 *
 * Default SearchOutput:
 * ```typescript
 * interface SearchOutput {
 *   success: boolean;
 *   query: string;
 *   scope: QmdScope;
 *   results: Array<{ path: string; title: string; snippet: string; score: number }>;
 *   total: number;
 * }
 * ```
 *
 * TimelineOutput (--timeline flag):
 * ```typescript
 * interface TimelineOutput {
 *   success: boolean;
 *   query: string;
 *   scope: QmdScope;
 *   items: Array<{ date: string; title: string; source: string; type: string }>;
 *   themes: string[];
 *   dateRange: { start: string; end: string };
 * }
 * ```
 */
import type { Command } from 'commander';
import { createServices } from '@arete/core';
import type { QmdScope, AreteConfig, StorageAdapter, ResolvedEntity, WorkspacePaths, DateRange, MemoryTimeline } from '@arete/core';
/** Search result item */
export interface SearchResultItem {
    /** Relative path to matching file */
    path: string;
    /** Extracted title or filename */
    title: string;
    /** Context snippet around match */
    snippet: string;
    /** Relevance score (0-1) */
    score: number;
}
/** Default search output schema */
export interface SearchOutput {
    success: boolean;
    query: string;
    scope: QmdScope;
    results: SearchResultItem[];
    /** Total matches (may exceed results.length due to --limit) */
    total: number;
}
/** Error output schema */
export interface SearchErrorOutput {
    success: false;
    error: string;
    code?: 'QMD_NOT_AVAILABLE' | 'WORKSPACE_NOT_FOUND' | 'INVALID_SCOPE' | 'COLLECTION_NOT_FOUND' | 'PERSON_NOT_FOUND' | 'PERSON_AMBIGUOUS' | 'INVALID_FLAGS' | 'TIMELINE_ERROR';
    /** Resolution options for PERSON_AMBIGUOUS */
    options?: Array<{
        name: string;
        slug: string;
        category: string;
    }>;
}
/** Timeline item in output */
export interface TimelineOutputItem {
    date: string;
    title: string;
    source: string;
    type: string;
}
/**
 * Timeline output schema (--timeline flag)
 *
 * dateRange reflects actual data bounds:
 * - start/end are empty strings when no items match
 * - when items exist, start is the earliest date and end is the latest
 */
export interface TimelineOutput {
    success: boolean;
    query: string;
    scope: QmdScope;
    items: TimelineOutputItem[];
    themes: string[];
    dateRange: {
        start: string;
        end: string;
    };
}
/** Answer output schema (--answer flag) */
export interface AnswerOutput {
    success: boolean;
    query: string;
    scope: QmdScope;
    results: SearchResultItem[];
    /** AI-synthesized answer, null if AI not configured or synthesis failed */
    answer: string | null;
    /** Derived intent passed to QMD (if any) */
    intent?: string;
    /** Error message if synthesis failed */
    error?: string;
}
/**
 * Derive intent from query patterns.
 * Used to pass --intent to QMD for better semantic matching.
 */
export declare function deriveIntent(query: string): string | undefined;
/** Parse QMD CLI JSON output into SearchResultItem[]. */
export declare function parseQmdResults(stdout: string): SearchResultItem[];
/** Person resolution result for dependency injection */
export interface PersonResolution {
    type: 'single' | 'multiple' | 'none';
    match?: ResolvedEntity;
    matches?: ResolvedEntity[];
}
/** Mockable AI service interface for testing */
export interface MockableAIService {
    isConfigured(): boolean;
    call(task: 'summary' | 'extraction' | 'decision_extraction' | 'learning_extraction' | 'significance_analysis' | 'reconciliation', prompt: string): Promise<{
        text: string;
    }>;
}
/** Injectable test dependencies */
export interface SearchDeps {
    createServices: typeof createServices;
    loadConfig: (storage: StorageAdapter, workspacePath: string | null) => Promise<AreteConfig>;
    execFileAsync: (file: string, args: string[], opts: {
        timeout: number;
        cwd: string;
        maxBuffer?: number;
    }) => Promise<{
        stdout: string;
        stderr: string;
    }>;
    isQmdAvailable: () => boolean;
    /** Resolve person by name/email. Injected for testing. */
    resolvePerson?: (name: string, services: Awaited<ReturnType<typeof createServices>>, paths: WorkspacePaths) => Promise<PersonResolution>;
    /** Get timeline from memory service. Injected for testing. */
    getTimeline?: (query: string, paths: WorkspacePaths, range?: DateRange, services?: Awaited<ReturnType<typeof createServices>>) => Promise<MemoryTimeline>;
    /** Override AI service for testing. */
    ai?: MockableAIService;
}
/**
 * Run search command logic. Exported for testing.
 */
export declare function runSearch(query: string, opts: {
    scope?: string;
    limit?: string;
    json?: boolean;
    person?: string;
    timeline?: boolean;
    days?: string;
    answer?: boolean;
}, deps?: SearchDeps): Promise<void>;
export declare function registerSearchCommand(program: Command): void;
//# sourceMappingURL=search.d.ts.map