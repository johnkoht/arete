/**
 * arete calendar — calendar event management commands
 */
import { createServices, loadConfig, getCalendarProvider } from '@arete/core';
import type { Command } from 'commander';
/**
 * Parse natural language date strings into Date objects.
 * Supports:
 * - ISO dates: 2026-02-26T14:00:00
 * - Keywords: today, tomorrow
 * - Day + time: monday 2pm, tuesday 10:30am
 * - Relative: next monday, next week
 */
export declare function parseNaturalDate(input: string): Date;
export interface CalendarDeps {
    createServicesFn: typeof createServices;
    loadConfigFn: typeof loadConfig;
    getCalendarProviderFn: typeof getCalendarProvider;
}
export interface CreateEventOptions {
    title: string;
    start: string;
    duration: number;
    with?: string;
    description?: string;
    json: boolean;
}
export declare function createCalendarEvent(opts: CreateEventOptions, deps?: CalendarDeps): Promise<void>;
export declare function registerCalendarCommands(program: Command): void;
//# sourceMappingURL=calendar.d.ts.map