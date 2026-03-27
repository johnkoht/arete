/**
 * Krisp integration — pull recordings into workspace.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { WorkspacePaths } from '../../models/index.js';
import { KrispMcpClient } from './client.js';
import { loadKrispCredentials } from './config.js';
import { meetingFilename } from '../meetings.js';
import type { CalendarEvent } from '../calendar/types.js';
export interface PullKrispOptions {
    /** Calendar events for importance inference (optional) */
    calendarEvents?: CalendarEvent[];
}
export declare function pullKrisp(storage: StorageAdapter, workspaceRoot: string, paths: WorkspacePaths, days: number, options?: PullKrispOptions): Promise<{
    success: boolean;
    saved: number;
    errors: string[];
}>;
export { meetingFilename, loadKrispCredentials, KrispMcpClient };
export type { MeetingForSave } from '../meetings.js';
//# sourceMappingURL=index.d.ts.map