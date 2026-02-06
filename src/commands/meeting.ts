/**
 * Meeting commands – add meetings from manual input (paste, file).
 */

import { readFileSync } from 'fs';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { saveMeeting, meetingFilename } from '../core/meetings.js';
import { error, info, success } from '../core/utils.js';
import type { MeetingForSave } from '../core/meetings.js';
import type { CommandOptions } from '../types.js';

interface MeetingAddOptions extends CommandOptions {
  file?: string;
  stdin?: boolean;
}

interface MeetingInput {
  title?: string;
  date?: string;
  summary?: string;
  transcript?: string;
  url?: string;
  action_items?: string[];
  attendees?: string[] | Array<{ name?: string; email?: string }>;
  attendee_ids?: string[];
  company?: string;
  pillar?: string;
  duration_minutes?: number;
}

function normalizeMeetingInput(raw: MeetingInput): MeetingForSave {
  const today = new Date().toISOString().slice(0, 10);
  const title = raw.title?.trim() || 'Untitled Meeting';
  const date = (raw.date?.trim().slice(0, 10)) || today;
  const summary = raw.summary?.trim() ?? '';
  const transcript = raw.transcript?.trim() ?? '';
  if (!summary && !transcript) {
    throw new Error('At least one of summary or transcript is required');
  }
  const actionItems = Array.isArray(raw.action_items)
    ? raw.action_items.filter((a): a is string => typeof a === 'string')
    : [];
  const attendees = Array.isArray(raw.attendees)
    ? raw.attendees.map((a) =>
        typeof a === 'string' ? a : { name: a.name, email: a.email }
      )
    : [];

  const attendeeIds = Array.isArray(raw.attendee_ids)
    ? raw.attendee_ids.filter((s): s is string => typeof s === 'string')
    : undefined;
  const company = typeof raw.company === 'string' ? raw.company.trim() || undefined : undefined;
  const pillar = typeof raw.pillar === 'string' ? raw.pillar.trim() || undefined : undefined;

  return {
    title,
    date,
    duration_minutes: typeof raw.duration_minutes === 'number' ? raw.duration_minutes : 0,
    summary: summary || 'No summary available.',
    transcript: transcript || 'No transcript available.',
    action_items: actionItems,
    highlights: [],
    attendees,
    attendee_ids: attendeeIds?.length ? attendeeIds : undefined,
    company,
    pillar,
    url: raw.url?.trim() ?? '',
  };
}

export async function meetingAddCommand(options: MeetingAddOptions): Promise<void> {
  const { file, stdin, json } = options;
  if (!file && !stdin) {
    if (json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Provide --file <path> or --stdin to read meeting data',
        })
      );
    } else {
      error('Provide --file <path> or --stdin to read meeting data');
      info('Example: arete meeting add --file meeting.json');
      info('Example: echo \'{"title":"Standup","summary":"..."}\' | arete meeting add --stdin');
    }
    process.exit(1);
  }

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

  let raw: MeetingInput;
  try {
    if (stdin) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } else if (file) {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } else {
      throw new Error('No input source');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Invalid JSON: ${msg}` }));
    } else {
      error(`Invalid JSON: ${msg}`);
    }
    process.exit(1);
  }

  let meeting: MeetingForSave;
  try {
    meeting = normalizeMeetingInput(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ success: false, error: msg }));
    } else {
      error(msg);
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const outputDir = `${paths.resources}/meetings`;
  const result = saveMeeting(meeting, outputDir, paths, {
    integration: 'Manual',
    force: false,
  });

  if (json) {
    console.log(
      JSON.stringify({
        success: true,
        saved: result.saved,
        path: result.path,
        filename: result.path ? meetingFilename(meeting) : null,
      })
    );
    return;
  }

  if (result.saved && result.path) {
    success(`Saved: ${result.path}`);
  } else {
    info(`Skipped (already exists): ${meetingFilename(meeting)}`);
  }
}
