/**
 * Krisp integration — pull recordings into workspace.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { WorkspacePaths } from '../../models/index.js';
import { KrispMcpClient } from './client.js';
import { loadKrispCredentials } from './config.js';
import { meetingFilename } from '../meetings.js';
export declare function pullKrisp(storage: StorageAdapter, workspaceRoot: string, paths: WorkspacePaths, days: number): Promise<{
    success: boolean;
    saved: number;
    errors: string[];
}>;
export { meetingFilename, loadKrispCredentials, KrispMcpClient };
export type { MeetingForSave } from '../meetings.js';
//# sourceMappingURL=index.d.ts.map