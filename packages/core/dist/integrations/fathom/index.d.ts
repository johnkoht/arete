/**
 * Fathom integration — pull recordings into workspace.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { WorkspacePaths } from '../../models/index.js';
import { FathomClient, loadFathomApiKey } from './client.js';
import { meetingFilename } from '../meetings.js';
import type { CalendarEvent } from '../calendar/types.js';
export interface PullFathomOptions {
    /** Calendar events for importance inference (optional) */
    calendarEvents?: CalendarEvent[];
}
export type PullFathomResult = {
    success: boolean;
    saved: number;
    errors: string[];
};
export declare function pullFathom(storage: StorageAdapter, workspaceRoot: string, paths: WorkspacePaths, days: number, options?: PullFathomOptions): Promise<PullFathomResult>;
export { meetingFilename, loadFathomApiKey, FathomClient };
export type { MeetingForSave } from '../meetings.js';
//# sourceMappingURL=index.d.ts.map