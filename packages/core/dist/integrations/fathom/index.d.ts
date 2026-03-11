/**
 * Fathom integration — pull recordings into workspace.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { WorkspacePaths } from '../../models/index.js';
import { FathomClient, loadFathomApiKey } from './client.js';
import { meetingFilename } from '../meetings.js';
export declare function pullFathom(storage: StorageAdapter, workspaceRoot: string, paths: WorkspacePaths, days: number): Promise<{
    success: boolean;
    saved: number;
    errors: string[];
}>;
export { meetingFilename, loadFathomApiKey, FathomClient };
export type { MeetingForSave } from '../meetings.js';
//# sourceMappingURL=index.d.ts.map