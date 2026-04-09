/**
 * HygieneService — scans for workspace entropy and applies approved cleanup actions.
 *
 * Pure-read scan phase detects stale meetings, resolved commitments, old memory
 * entries, bloated activity logs, and duplicate memory items. Apply phase
 * delegates to existing service methods (archive, purge, compact, trim).
 *
 * All I/O via StorageAdapter — no direct fs imports.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { CommitmentsService } from './commitments.js';
import type { AreaMemoryService } from './area-memory.js';
import type { AreaParserService } from './area-parser.js';
import type { MemoryService } from './memory.js';
import type { HygieneReport, HygieneResult, HygieneScanOptions, ApprovedAction } from '../models/hygiene.js';
export declare class HygieneService {
    private readonly storage;
    private readonly workspaceRoot;
    private readonly commitments;
    private readonly areaMemory;
    private readonly areaParser;
    private readonly memory;
    constructor(storage: StorageAdapter, workspaceRoot: string, commitments: CommitmentsService, areaMemory: AreaMemoryService, areaParser: AreaParserService, memory: MemoryService);
    scan(options?: HygieneScanOptions): Promise<HygieneReport>;
    apply(report: HygieneReport, actions: ApprovedAction[]): Promise<HygieneResult>;
    private archiveMeeting;
    private purgeCommitments;
    private compactMemory;
    private trimActivity;
}
//# sourceMappingURL=hygiene.d.ts.map