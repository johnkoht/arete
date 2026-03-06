/**
 * arete daily — morning intelligence brief
 *
 * Shows: today's meetings, overdue commitments, active projects,
 * recent decisions, and top cross-person signal patterns.
 */
import type { Command } from 'commander';
import type { Commitment, StorageAdapter, SignalPattern } from '@arete/core';
export type CalendarEvent = {
    title: string;
    start: string;
    end?: string;
    attendees?: string[];
};
export type ProjectInfo = {
    slug: string;
    title: string;
    lastModified: Date | null;
    stale: boolean;
};
export type DecisionEntry = {
    text: string;
    date?: string;
};
export type DailyBrief = {
    meetings: CalendarEvent[];
    overdueCommitments: Array<{
        commitment: Commitment;
        daysOverdue: number;
    }>;
    activeProjects: ProjectInfo[];
    recentDecisions: DecisionEntry[];
    patterns: SignalPattern[];
    generatedAt: string;
};
export type DailyCommandDeps = {
    pullCalendarFn?: (workspaceRoot: string) => CalendarEvent[];
    detectPatternsFn?: (meetingsDir: string, storage: StorageAdapter, opts: {
        days: number;
    }) => Promise<SignalPattern[]>;
};
export declare function runDaily(opts: {
    json?: boolean;
}, deps?: DailyCommandDeps): Promise<void>;
export declare function registerDailyCommand(program: Command, deps?: DailyCommandDeps): void;
//# sourceMappingURL=daily.d.ts.map