/**
 * Fathom API client.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { FathomMeeting } from './types.js';
export declare function loadFathomApiKey(storage: StorageAdapter, workspaceRoot: string | null): Promise<string | null>;
export interface ListMeetingsOptions {
    startDate?: string;
    endDate?: string;
    includeSummary?: boolean;
    includeTranscript?: boolean;
    includeActionItems?: boolean;
}
export declare class FathomClient {
    private apiKey;
    private baseUrl;
    constructor(apiKey: string, baseUrl?: string);
    private request;
    listMeetings(options?: ListMeetingsOptions): Promise<FathomMeeting[]>;
    fetchRecording(recordingId: number | string): Promise<{
        summary: string;
        transcript: string;
        actionItems: string[];
    }>;
}
//# sourceMappingURL=client.d.ts.map