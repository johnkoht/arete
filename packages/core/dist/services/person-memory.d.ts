/**
 * Person memory signal collection, aggregation, rendering, and upsert.
 *
 * Extracted from entity.ts to keep the EntityService focused on entity
 * resolution while person-memory concerns live in their own module.
 */
import type { PersonStance, PersonActionItem } from './person-signals.js';
import type { RelationshipHealth } from './person-health.js';
import type { Commitment } from '../models/index.js';
export interface PersonMemorySignal {
    kind: 'ask' | 'concern';
    topic: string;
    date: string;
    source: string;
}
export interface AggregatedPersonSignal {
    topic: string;
    count: number;
    lastMentioned: string;
    sources: string[];
}
export interface RefreshPersonMemoryInternalOptions {
    personSlug?: string;
    minMentions: number;
}
export declare const AUTO_PERSON_MEMORY_START = "<!-- AUTO_PERSON_MEMORY:START -->";
export declare const AUTO_PERSON_MEMORY_END = "<!-- AUTO_PERSON_MEMORY:END -->";
/**
 * Regex to extract the 8-char hash prefix from a commitment line's HTML comment.
 * Matches `<!-- h:3f9a1b2c -->` and captures `3f9a1b2c`.
 */
export declare const HASH_COMMENT_RE: RegExp;
/**
 * Normalize a signal topic string for deduplication and aggregation.
 * Lowercases, strips punctuation, collapses whitespace, and truncates to 120 chars.
 */
export declare function normalizeSignalTopic(topic: string): string;
/**
 * Extract ask/concern signals for a person from meeting content.
 * Uses regex patterns to detect phrases like "asked about", "concerned about",
 * and speaker-attributed dialogue.
 *
 * @param content - Meeting transcript or notes text
 * @param personName - Name of the person to extract signals for
 * @param date - Meeting date (YYYY-MM-DD)
 * @param source - Meeting filename for provenance tracking
 */
export declare function collectSignalsForPerson(content: string, personName: string, date: string, source: string): PersonMemorySignal[];
/**
 * Aggregate raw signals by topic, counting occurrences and tracking sources.
 * Filters out topics below the minimum mention threshold.
 *
 * @param signals - Raw signals from collectSignalsForPerson
 * @param minMentions - Minimum mention count to include a topic
 */
export declare function aggregateSignals(signals: PersonMemorySignal[], minMentions: number): {
    asks: AggregatedPersonSignal[];
    concerns: AggregatedPersonSignal[];
};
/**
 * Extract all 8-char hash prefixes from `<!-- h:XXXXXXXX -->` comments in text.
 * Scans the entire file content (not just the auto-section) so that deleted
 * lines are correctly detected as absent.
 */
export declare function extractHashesFromContent(content: string): Set<string>;
/**
 * Extract hash prefixes from checked (`- [x]`) commitment lines.
 * A line must match `- [x]` AND contain a `<!-- h:XXXXXXXX -->` comment to be
 * treated as a checked commitment (the hash uniquely identifies it as machine-generated).
 */
export declare function extractCheckedHashes(content: string): string[];
/**
 * Render the auto-generated person memory section as markdown.
 * Includes repeated asks, concerns, stances, action items, and relationship health.
 * Output is wrapped in AUTO_PERSON_MEMORY sentinel comments for upsert.
 */
export declare function renderPersonMemorySection(asks: AggregatedPersonSignal[], concerns: AggregatedPersonSignal[], options?: {
    stances?: PersonStance[];
    actionItems?: PersonActionItem[];
    health?: RelationshipHealth;
    /**
     * When provided, render commitment checkboxes (`- [ ] text (date) <!-- h:XXXXXXXX -->`)
     * instead of plain-text action items. Pass the open Commitment[] for this person.
     * Pass an empty array to render the section with no items (no "None detected yet.").
     * When undefined, falls back to plain-text action items rendering (no regression).
     */
    commitments?: Commitment[];
}): string;
/**
 * Extract the auto-generated memory section from a person file's content.
 * Returns null if no section is found or if it's empty.
 */
export declare function extractPersonMemorySection(content: string): string | null;
/**
 * Parse the "Last refreshed" date from an existing person memory section.
 * Returns the YYYY-MM-DD string or null if not found.
 */
export declare function getPersonMemoryLastRefreshed(content: string): string | null;
/**
 * Check if a person's memory section is stale and needs refreshing.
 * Returns true if lastRefreshed is null, invalid, or older than ifStaleDays.
 * Always returns true when ifStaleDays is undefined or <= 0 (i.e., always refresh).
 */
export declare function isMemoryStale(lastRefreshed: string | null, ifStaleDays: number | undefined): boolean;
/**
 * Insert or replace the auto-generated memory section in a person file.
 * If sentinel comments exist, replaces the content between them.
 * Otherwise, appends the section at the end of the file.
 */
export declare function upsertPersonMemorySection(content: string, section: string): string;
//# sourceMappingURL=person-memory.d.ts.map