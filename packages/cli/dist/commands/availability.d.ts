/**
 * arete availability — find mutual availability with colleagues
 */
import { createServices, loadConfig, getCalendarProvider } from '@arete/core';
import type { Command } from 'commander';
export interface AvailabilityDeps {
    createServicesFn: typeof createServices;
    loadConfigFn: typeof loadConfig;
    getCalendarProviderFn: typeof getCalendarProvider;
}
export declare function findAvailability(opts: {
    with: string;
    duration: number;
    days: number;
    limit: number;
    json: boolean;
}, deps?: AvailabilityDeps): Promise<void>;
export declare function registerAvailabilityCommands(program: Command): void;
//# sourceMappingURL=availability.d.ts.map