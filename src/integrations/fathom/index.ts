/**
 * Fathom integration – list, fetch, and get recordings (Node/TypeScript).
 *
 *   arete fathom list [--days N]
 *   arete fathom fetch [--days N]
 *   arete fathom get <id>
 *
 * For generic pull: arete pull fathom [--days N]
 */

import { findWorkspaceRoot, getWorkspacePaths } from '../../core/workspace.js';
import { error, info, success } from '../../core/utils.js';
import { saveMeeting, meetingFilename } from '../../core/meetings.js';
import { FathomClient, loadFathomApiKey } from './client.js';
import { meetingFromListItem } from './save.js';
import type { MeetingForSave } from './save.js';
import type { CommandOptions } from '../../types.js';

export interface FathomOptions extends CommandOptions {
  days?: string;
  id?: string;
}

function parseDays(daysStr: string | undefined): number {
  const n = parseInt(daysStr ?? '7', 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * List Fathom recordings (metadata only).
 */
async function listRecordings(options: FathomOptions): Promise<void> {
  const { days = '7', json } = options;
  const workspaceRoot = findWorkspaceRoot() ?? undefined;
  const apiKey = loadFathomApiKey(workspaceRoot ?? null);
  if (!apiKey) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Fathom API key not found' }));
    } else {
      error('Fathom API key not found');
      info('Set FATHOM_API_KEY or run: arete integration add fathom');
    }
    process.exit(1);
  }

  const client = new FathomClient(apiKey);
  const d = parseDays(days);
  const { startDate, endDate } = dateRange(d);

  try {
    const meetings = await client.listMeetings({ startDate, endDate });
    if (json) {
      console.log(JSON.stringify(meetings, null, 2));
      return;
    }
    console.log(`Found ${meetings.length} meetings\n`);
    for (const m of meetings) {
      const created = (m.created_at ?? '').slice(0, 10);
      const duration =
        m.recording_start_time && m.recording_end_time
          ? Math.round(
              (new Date(m.recording_end_time).getTime() -
                new Date(m.recording_start_time).getTime()) /
                60_000
            )
          : 0;
      console.log(`  - [${m.recording_id}] ${created} - "${m.title ?? 'Untitled'}" (${duration} min)`);
    }
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: (err as Error).message }));
    } else {
      error((err as Error).message);
      info('Make sure you have configured Fathom: arete integration add fathom');
    }
    process.exit(1);
  }
}

/**
 * Core fetch: list meetings with content and save to outputDir. Throws on fatal errors.
 */
async function doFetchRecordings(
  workspaceRoot: string,
  days: number,
  json: boolean
): Promise<void> {
  const apiKey = loadFathomApiKey(workspaceRoot);
  if (!apiKey) throw new Error('Fathom API key not found');

  const paths = getWorkspacePaths(workspaceRoot);
  const outputDir = `${paths.resources}/meetings`;
  const { startDate, endDate } = dateRange(days);
  const client = new FathomClient(apiKey);

  if (!json) {
    console.log(
      `Fetching meetings from ${startDate} to ${endDate} (with summary & transcript)...`
    );
  }
  const meetings = await client.listMeetings({
    startDate,
    endDate,
    includeSummary: true,
    includeTranscript: true,
    includeActionItems: true,
  });
  if (!json) {
    console.log(`Found ${meetings.length} meetings\n`);
  }

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (const m of meetings) {
    const title = m.title ?? 'Untitled';
    try {
      if (!json) {
        process.stdout.write(`  Saving: ${title}... `);
      }
      const meeting = meetingFromListItem(m);
      const result = saveMeeting(meeting, outputDir, paths, {
        integration: 'Fathom',
        force: false,
      });
      if (result.saved) {
        if (!json) {
          console.log(`✓ ${meetingFilename(meeting)}`);
        }
        saved += 1;
      } else {
        if (!json) {
          console.log('⊘ Skipped (already exists)');
        }
        skipped += 1;
      }
    } catch (e) {
      if (!json) {
        console.log(`✗ Error: ${(e as Error).message}`);
      }
      errors += 1;
    }
  }

  if (json) {
    console.log(
      JSON.stringify({
        success: errors === 0,
        saved,
        skipped,
        errors,
        outputDir,
      })
    );
  } else {
    console.log(`\nComplete: ${saved} saved to ${outputDir}, ${skipped} skipped, ${errors} errors`);
  }
}

/**
 * Fetch Fathom recordings (with summary & transcript) and save to resources/meetings.
 */
async function fetchRecordings(options: FathomOptions): Promise<void> {
  const { days = '7', json } = options;
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }

  const apiKey = loadFathomApiKey(workspaceRoot);
  if (!apiKey) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Fathom API key not found' }));
    } else {
      error('Fathom API key not found');
      info('Set FATHOM_API_KEY or run: arete integration add fathom');
    }
    process.exit(1);
  }

  try {
    await doFetchRecordings(workspaceRoot, parseDays(days), json ?? false);
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: (err as Error).message }));
    } else {
      error((err as Error).message);
    }
    process.exit(1);
  }
}

/**
 * Get a single recording by ID (fetch summary + transcript, then save or print).
 */
async function getRecording(options: FathomOptions): Promise<void> {
  const { id, json } = options;
  if (!id) {
    error('Recording ID required');
    info('Usage: arete fathom get <recording_id>');
    process.exit(1);
  }

  const workspaceRoot = findWorkspaceRoot();
  const apiKey = loadFathomApiKey(workspaceRoot ?? null);
  if (!apiKey) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Fathom API key not found' }));
    } else {
      error('Fathom API key not found');
      info('Set FATHOM_API_KEY or run: arete integration add fathom');
    }
    process.exit(1);
  }

  const client = new FathomClient(apiKey);

  try {
    const { summary, transcript } = await client.fetchRecording(id);
    const paths = workspaceRoot ? getWorkspacePaths(workspaceRoot) : null;
    const outputDir = paths ? `${paths.resources}/meetings` : 'resources/meetings';

    const meeting: MeetingForSave = {
      title: `Recording ${id}`,
      date: new Date().toISOString().slice(0, 10),
      recording_id: Number(id) || 0,
      duration_minutes: 0,
      summary,
      transcript,
      action_items: [],
      highlights: [],
      attendees: [],
      url: '',
    };

    if (json) {
      console.log(JSON.stringify(meeting, null, 2));
      return;
    }

    const result = saveMeeting(meeting, outputDir, paths, {
      integration: 'Fathom',
      force: false,
    });
    if (result.saved && result.path) {
      success(`Saved: ${result.path}`);
    } else {
      info(`Skipped (already exists): ${meetingFilename(meeting)}`);
    }
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: (err as Error).message }));
    } else {
      error((err as Error).message);
    }
    process.exit(1);
  }
}

/**
 * Fathom command router.
 */
export async function fathomCommand(action: string, options: FathomOptions): Promise<void> {
  switch (action) {
    case 'list':
      return listRecordings(options);
    case 'fetch':
      return fetchRecordings(options);
    case 'get':
      return getRecording(options);
    default:
      error(`Unknown Fathom action: ${action}`);
      info('Available: list, fetch, get');
      process.exit(1);
  }
}

/**
 * Pull handler for fathom (used by arete pull fathom).
 * Returns so pull command can report success/failure.
 */
export async function pullFathom(days: number, json: boolean): Promise<{ success: boolean; error?: string }> {
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    return { success: false, error: 'Not in an Areté workspace' };
  }
  const apiKey = loadFathomApiKey(workspaceRoot);
  if (!apiKey) {
    return { success: false, error: 'Fathom API key not found' };
  }

  try {
    await doFetchRecordings(workspaceRoot, days, json);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export default fathomCommand;
