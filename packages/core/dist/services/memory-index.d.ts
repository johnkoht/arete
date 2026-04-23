/**
 * MemoryIndexService — generates `.arete/memory/index.md`, the Obsidian
 * landing page for the wiki layer. Lists topic pages, people, and areas
 * with one-line descriptions and `[[wikilinks]]`.
 *
 * Regenerated only on `arete memory refresh` (not on per-ingest writes).
 * Pure renderer + service wrapper; idempotent write via
 * `StorageAdapter.writeIfChanged`.
 *
 * See plan: dev/work/plans/topic-wiki-memory/plan.md Step 5.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { Person } from '../models/entities.js';
import type { AreaParserService } from './area-parser.js';
import type { TopicMemoryService } from './topic-memory.js';
import type { EntityService } from './entity.js';
import { type TopicPage } from '../models/topic-page.js';
export interface AreaIndexEntry {
    slug: string;
    name: string;
    topicCount: number;
    openItemCount: number;
}
export interface MemoryIndexData {
    topics: TopicPage[];
    people: Person[];
    areas: AreaIndexEntry[];
    /**
     * Errors encountered during data gathering (e.g., corrupt topic page).
     * Surfaced at the bottom of index.md as a diagnostic note —
     * partial-state tolerant per pre-mortem Risk 14.
     */
    errors?: string[];
}
/**
 * Render MemoryIndexData as markdown. Pure — no I/O, no wall-clock reads.
 * Stable output for equal inputs.
 */
export declare function renderMemoryIndex(data: MemoryIndexData): string;
export declare class MemoryIndexService {
    private readonly storage;
    private readonly topicMemory;
    private readonly entity;
    private readonly areaParser;
    /** Optional CommitmentsService dependency for computing per-area open counts. */
    private readonly commitments;
    constructor(storage: StorageAdapter, topicMemory: TopicMemoryService, entity: EntityService, areaParser: AreaParserService, 
    /** Optional CommitmentsService dependency for computing per-area open counts. */
    commitments: {
        listOpen(opts?: {
            area?: string;
        }): Promise<unknown[]>;
    });
    /**
     * Gather data from all memory surfaces and render `index.md`. Idempotent:
     * when content byte-equals existing file, no write is performed.
     *
     * Returns both the write status AND any errors encountered during
     * gathering — surfaces partial-state corruption to CLI observability
     * so users know when topic files are being silently excluded.
     */
    refreshMemoryIndex(workspacePaths: WorkspacePaths): Promise<{
        status: 'unchanged' | 'updated';
        errors: string[];
    }>;
    /**
     * Gather raw data for the index. Exported as a method (not pure function)
     * because each data source requires its own service. Partial-state tolerant
     * — errors from any source surface in `data.errors` without failing the
     * whole gather.
     */
    gatherIndexData(workspacePaths: WorkspacePaths): Promise<MemoryIndexData>;
}
//# sourceMappingURL=memory-index.d.ts.map