/**
 * Calendar provider factory.
 */
import type { AreteConfig } from '../../models/workspace.js';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { CalendarProvider } from './types.js';
export type { BusyBlock, CalendarEvent, CalendarOptions, CalendarProvider, CreateEventInput, CreatedEvent, FreeBusyCalendarResult, FreeBusyResult, } from './types.js';
export declare function getCalendarProvider(config: AreteConfig, storage?: StorageAdapter, workspaceRoot?: string): Promise<CalendarProvider | null>;
//# sourceMappingURL=index.d.ts.map