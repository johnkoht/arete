/**
 * Krisp integration — pull recordings into workspace.
 */

import { join } from 'path';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { WorkspacePaths } from '../../models/index.js';
import { KrispMcpClient } from './client.js';
import { loadKrispCredentials } from './config.js';
import { meetingFromKrisp } from './save.js';
import { saveMeetingFile, meetingFilename, type MeetingForSave } from '../meetings.js';

const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: Krisp

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

## Transcript
{transcript}
`;

function dateRange(days: number): { after: string; before: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    after: start.toISOString().slice(0, 10),
    before: end.toISOString().slice(0, 10),
  };
}

export async function pullKrisp(
  storage: StorageAdapter,
  workspaceRoot: string,
  paths: WorkspacePaths,
  days: number
): Promise<{ success: boolean; saved: number; errors: string[] }> {
  const creds = await loadKrispCredentials(storage, workspaceRoot);
  if (!creds) {
    return {
      success: false,
      saved: 0,
      errors: ['Krisp credentials not found — run: arete integration configure krisp'],
    };
  }

  const outputDir = join(paths.resources, 'meetings');
  const { after, before } = dateRange(days);
  const client = new KrispMcpClient(storage, workspaceRoot);

  const meetings = await client.listMeetings({ after, before });

  let saved = 0;
  const errors: string[] = [];

  for (const m of meetings) {
    try {
      const meeting = meetingFromKrisp(m);
      const fullPath = await saveMeetingFile(
        storage,
        meeting,
        outputDir,
        DEFAULT_TEMPLATE,
        { integration: 'Krisp', force: false }
      );
      if (fullPath) saved += 1;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  return { success: errors.length === 0, saved, errors };
}

export { meetingFilename, loadKrispCredentials, KrispMcpClient };
export type { MeetingForSave } from '../meetings.js';
