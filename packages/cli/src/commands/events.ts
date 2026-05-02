/**
 * arete events log — thin CLI wrapper over MemoryLogService.append for
 * agent-driven instrumentation (Phase 0).
 *
 * Today the only subcommand is `events log winddown --event start|end`,
 * called from the daily-winddown skill prose. Adding more event types
 * later is a matter of adding subcommands; the grammar enforcement and
 * append atomicity already live in core.
 */

import type { Command } from 'commander';
import { createServices } from '@arete/core';
import { error as printError, success } from '../formatters.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WinddownEventName = 'start' | 'end';

export interface WinddownEventOptions {
  event?: WinddownEventName;
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Runner (DI for tests)
// ---------------------------------------------------------------------------

export interface EventsCommandDeps {
  /** Optional clock override for tests. */
  now?: Date;
}

export async function runWinddownEventLog(
  opts: WinddownEventOptions,
  deps: EventsCommandDeps = {},
): Promise<void> {
  if (opts.event !== 'start' && opts.event !== 'end') {
    const message = `--event must be "start" or "end" (got: ${String(opts.event)})`;
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: message }));
    } else {
      printError(message);
    }
    process.exit(1);
  }

  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();
  if (!root) {
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      printError('Not in an Areté workspace');
    }
    process.exit(1);
  }

  const paths = services.workspace.getPaths(root);
  await services.memoryLog.append(
    paths,
    {
      event: 'winddown',
      fields: { event: opts.event! },
    },
    { now: deps.now },
  );

  if (opts.json) {
    console.log(JSON.stringify({ success: true, event: 'winddown', kind: opts.event }));
    return;
  }

  success(`Logged winddown event=${opts.event}`);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerEventsCommand(program: Command, deps: EventsCommandDeps = {}): void {
  const events = program.command('events').description('Append agent-driven events to memory/log.md');
  const log = events.command('log').description('Append a single event');

  log
    .command('winddown')
    .description('Log a daily-winddown lifecycle event (start | end)')
    .requiredOption('--event <kind>', 'Event kind: start | end')
    .option('--json', 'Output as JSON')
    .action(async (opts: WinddownEventOptions) => {
      await runWinddownEventLog(opts, deps);
    });
}
