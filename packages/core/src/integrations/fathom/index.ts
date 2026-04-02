/**
 * Fathom integration — pull recordings into workspace.
 */

import { join } from 'path';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { WorkspacePaths } from '../../models/index.js';
import { FathomClient, loadFathomApiKey } from './client.js';
import { meetingFromListItem } from './save.js';
import {
  saveMeetingFile,
  meetingFilename,
  findMatchingAgendaPath,
  findMatchingCalendarEvent,
  inferMeetingImportance,
  type MeetingForSave,
} from '../meetings.js';
import type { CalendarEvent } from '../calendar/types.js';
import { loadReconciliationContext, reconcileMeetingBatch } from '../../services/meeting-reconciliation.js';
import type { MeetingExtractionBatch } from '../../services/meeting-reconciliation.js';
import type { MeetingIntelligence } from '../../services/meeting-extraction.js';
import type { ReconciliationResult } from '../../models/entities.js';

const DEFAULT_TEMPLATE = `# {title}

**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary

{summary}

## Action Items

{action_items}

<details>
<summary>Recorder Notes</summary>

### Original Summary

{summary}

### Key Points

{key_points}

</details>

## Transcript

{transcript}
`;

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export interface PullFathomOptions {
  /** Calendar events for importance inference (optional) */
  calendarEvents?: CalendarEvent[];
  /** Run reconciliation after saving meetings (default: false) */
  reconcile?: boolean;
}

export type PullFathomResult = {
  success: boolean;
  saved: number;
  errors: string[];
  reconciliation?: ReconciliationResult;
};

export async function pullFathom(
  storage: StorageAdapter,
  workspaceRoot: string,
  paths: WorkspacePaths,
  days: number,
  options?: PullFathomOptions
): Promise<PullFathomResult> {
  const apiKey = await loadFathomApiKey(storage, workspaceRoot);
  if (!apiKey) {
    return { success: false, saved: 0, errors: ['Fathom API key not found'] };
  }

  const outputDir = join(paths.resources, 'meetings');
  const { startDate, endDate } = dateRange(days);
  const client = new FathomClient(apiKey);

  const meetings = await client.listMeetings({
    startDate,
    endDate,
    includeSummary: true,
    includeTranscript: true,
    includeActionItems: true,
  });

  let saved = 0;
  const errors: string[] = [];

  const calendarEvents = options?.calendarEvents ?? [];
  
  for (const m of meetings) {
    try {
      const meeting = meetingFromListItem(m);
      
      // Link agenda if available (use high-confidence matches only)
      const agenda = await findMatchingAgendaPath(
        storage,
        workspaceRoot,
        meeting.date,
        meeting.title
      );
      if (agenda) {
        meeting.agenda = agenda;
      }
      
      // Infer importance from calendar event if available (AC#1, AC#5, AC#6)
      const matchedEvent = findMatchingCalendarEvent(calendarEvents, meeting.date, meeting.title);
      if (matchedEvent) {
        meeting.importance = inferMeetingImportance(matchedEvent, { hasAgenda: !!agenda });
        // Copy recurring series ID if present
        if (matchedEvent.recurringEventId) {
          meeting.recurring_series_id = matchedEvent.recurringEventId;
        }
      } else {
        // Default to 'normal' when no calendar event matched (AC#6)
        meeting.importance = 'normal';
      }
      
      const fullPath = await saveMeetingFile(
        storage,
        meeting,
        outputDir,
        DEFAULT_TEMPLATE,
        { integration: 'Fathom', force: false }
      );
      if (fullPath) saved += 1;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  // Reconciliation: batch operation AFTER all meetings are saved
  let reconciliation: ReconciliationResult | undefined;
  if (options?.reconcile && saved > 0) {
    try {
      const context = await loadReconciliationContext(storage, workspaceRoot);

      // Build extraction batches from saved meetings.
      // Fathom meetings have raw action items (strings) — convert to
      // MeetingIntelligence shape for reconciliation.
      const batches: MeetingExtractionBatch[] = [];
      for (const m of meetings) {
        const meeting = meetingFromListItem(m);
        const meetingPath = join(
          paths.resources,
          'meetings',
          meetingFilename(meeting),
        );

        const actionItems = (meeting.action_items ?? []).map((desc, idx) => ({
          owner: '',
          ownerSlug: '',
          description: desc,
          direction: 'i_owe_them' as const,
          confidence: 0.5,
        }));

        const intelligence: MeetingIntelligence = {
          summary: meeting.summary ?? '',
          actionItems,
          nextSteps: [],
          decisions: [],
          learnings: [],
        };

        batches.push({ meetingPath, extraction: intelligence });
      }

      if (batches.length > 0) {
        reconciliation = reconcileMeetingBatch(batches, context);
      }
    } catch (e) {
      // Graceful degradation: reconciliation errors don't fail the pull
      console.warn('[fathom] Reconciliation failed (non-blocking):', (e as Error).message);
    }
  }

  return {
    success: errors.length === 0,
    saved,
    errors,
    reconciliation,
  };
}

export { meetingFilename, loadFathomApiKey, FathomClient };
export type { MeetingForSave } from '../meetings.js';
