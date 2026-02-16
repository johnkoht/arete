/**
 * arete meeting add — add meeting from JSON file or stdin
 */

import {
  createServices,
  saveMeetingFile,
  meetingFilename,
} from '@arete/core';
import type { MeetingForSave } from '@arete/core';
import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { success, error, info } from '../formatters.js';

const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

## Transcript
{transcript}
`;

export function registerMeetingCommands(program: Command): void {
  const meetingCmd = program.command('meeting').description('Add meetings');

  meetingCmd
    .command('add')
    .description('Add a meeting from JSON file or stdin')
    .option('--file <path>', 'Path to JSON file')
    .option('--stdin', 'Read JSON from stdin')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: { file?: string; stdin?: boolean; json?: boolean }) => {
        if (!opts.file && !opts.stdin) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Provide --file <path> or --stdin',
              }),
            );
          } else {
            error('Provide --file <path> or --stdin');
            info('Example: arete meeting add --file meeting.json');
          }
          process.exit(1);
        }

        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
          }
          process.exit(1);
        }

        let raw: Record<string, unknown>;
        try {
          if (opts.stdin) {
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk as Buffer);
            }
            raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } else if (opts.file) {
            raw = JSON.parse(readFileSync(opts.file, 'utf8'));
          } else {
            throw new Error('No input');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Invalid JSON: ${msg}` }));
          } else {
            error(`Invalid JSON: ${msg}`);
          }
          process.exit(1);
        }

        const meeting = normalizeMeetingInput(raw);
        const paths = services.workspace.getPaths(root);
        const outputDir = join(paths.resources, 'meetings');

        const fullPath = await saveMeetingFile(
          services.storage,
          meeting,
          outputDir,
          DEFAULT_TEMPLATE,
          { integration: 'Manual', force: false },
        );

        if (opts.json) {
          console.log(
            JSON.stringify({
              success: !!fullPath,
              saved: !!fullPath,
              path: fullPath,
              filename: fullPath ? meetingFilename(meeting) : null,
            }),
          );
          return;
        }

        if (fullPath) {
          success(`Saved: ${fullPath}`);
        } else {
          info(`Skipped (already exists): ${meetingFilename(meeting)}`);
        }
      },
    );
}

function normalizeMeetingInput(raw: Record<string, unknown>): MeetingForSave {
  const today = new Date().toISOString().slice(0, 10);
  const title = (raw.title as string)?.trim() || 'Untitled Meeting';
  const date = (raw.date as string)?.trim()?.slice(0, 10) || today;
  const summary = (raw.summary as string)?.trim() ?? '';
  const transcript = (raw.transcript as string)?.trim() ?? '';
  if (!summary && !transcript) {
    throw new Error('At least one of summary or transcript is required');
  }
  const actionItems = Array.isArray(raw.action_items)
    ? (raw.action_items as unknown[]).filter((a): a is string => typeof a === 'string')
    : [];
  const attendees = Array.isArray(raw.attendees)
    ? (raw.attendees as unknown[]).map((a): string | { name?: string | null; email?: string | null } =>
        typeof a === 'string' ? a : { name: (a as Record<string, unknown>).name as string | undefined, email: (a as Record<string, unknown>).email as string | undefined },
      )
    : [];

  return {
    title,
    date,
    duration_minutes: (typeof raw.duration_minutes === 'number' ? raw.duration_minutes : 0) as number,
    summary: summary || 'No summary available.',
    transcript: transcript || 'No transcript available.',
    action_items: actionItems,
    highlights: [],
    attendees,
    url: (raw.url as string)?.trim() ?? '',
  };
}
