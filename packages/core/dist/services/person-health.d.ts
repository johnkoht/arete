/**
 * Relationship health computation for person profiles.
 *
 * Pure computation — no I/O, no external dependencies.
 * Accepts meeting dates and open item count, returns health metrics
 * with an indicator (active/regular/cooling/dormant).
 */
export type HealthIndicator = 'active' | 'regular' | 'cooling' | 'dormant';
export type RelationshipHealth = {
    lastMet: string | null;
    daysSinceLastMet: number | null;
    meetingsLast30Days: number;
    meetingsLast90Days: number;
    openLoopCount: number;
    indicator: HealthIndicator;
};
/**
 * Compute relationship health metrics from meeting dates and open item count.
 *
 * @param meetingDates - Array of YYYY-MM-DD date strings
 * @param openItemCount - Number of open action items / loops
 * @param referenceDate - Pin the "current date" for testability (defaults to now)
 */
export declare function computeRelationshipHealth(meetingDates: string[], openItemCount: number, referenceDate?: Date): RelationshipHealth;
//# sourceMappingURL=person-health.d.ts.map