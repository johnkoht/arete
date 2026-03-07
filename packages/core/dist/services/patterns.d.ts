/**
 * Pattern detection service — finds recurring topics across meetings and people.
 *
 * detectCrossPersonPatterns() reads meeting files in the last N days, extracts
 * topics from their content, and returns topics mentioned in 2+ meetings
 * across 2+ distinct attendees.
 */
import type { StorageAdapter } from '../storage/adapter.js';
export type SignalPattern = {
    topic: string;
    mentions: number;
    people: string[];
    meetings: string[];
    lastSeen: string;
};
/**
 * Detect cross-person patterns in recent meetings.
 *
 * Reads meeting files from the last `days` days, extracts topics, and returns
 * patterns that appear in 2+ meetings across 2+ distinct attendees.
 *
 * @param meetingsDirPath - Absolute path to the meetings directory
 * @param storage - StorageAdapter for file access
 * @param options - { days: 30 } lookback window
 */
export declare function detectCrossPersonPatterns(meetingsDirPath: string, storage: StorageAdapter, options?: {
    days?: number;
}): Promise<SignalPattern[]>;
//# sourceMappingURL=patterns.d.ts.map