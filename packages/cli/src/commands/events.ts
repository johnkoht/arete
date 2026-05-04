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
import {
  createServices,
  evaluateSlackThread,
  type SlackThreadEvalInput,
} from '@arete/core';
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
// Slack-thread eval (Phase 1 §a.3 / MC3)
// ---------------------------------------------------------------------------

export interface SlackEvalCliOptions {
  thread?: string;
  messages?: string;
  participants?: string;
  decision?: boolean;
  userFlag?: boolean;
  json?: boolean;
}

/**
 * Run the slack-thread heuristic and append the result to
 * `.arete/memory/log.md` as a `slack_thread_eval` event. During the
 * 7-day shadow run (Phase 1 ship), the writer is gated by
 * ARETE_SLACK_SUMMARIES — this command logs the WOULD-decision
 * regardless, so John can spot-check false-pos / false-neg rates.
 *
 * The slack-digest skill calls this once per thread it processes.
 */
export async function runSlackThreadEval(
  opts: SlackEvalCliOptions,
  deps: EventsCommandDeps = {},
): Promise<void> {
  const thread = (opts.thread ?? '').trim();
  if (thread.length === 0) {
    const msg = '--thread <id> is required';
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }
  const messages = parseNonNegativeInt(opts.messages);
  if (messages === null) {
    const msg = '--messages <n> must be a non-negative integer';
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }
  const participants = parseNonNegativeInt(opts.participants);
  if (participants === null) {
    const msg = '--participants <n> must be a non-negative integer';
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }

  const input: SlackThreadEvalInput = {
    threadId: thread,
    messages,
    participants,
    decisionDetected: opts.decision === true,
    userFlagged: opts.userFlag === true,
  };
  const result = evaluateSlackThread(input);

  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();
  if (!root) {
    if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    else printError('Not in an Areté workspace');
    process.exit(1);
  }

  const paths = services.workspace.getPaths(root);
  await services.memoryLog.append(
    paths,
    {
      event: 'slack-thread-eval',
      fields: {
        thread: result.threadId,
        would_summarize: String(result.wouldSummarize),
        trigger: result.trigger,
        messages: String(result.messages),
        participants: String(result.participants),
      },
    },
    { now: deps.now },
  );

  if (opts.json) {
    console.log(
      JSON.stringify({
        success: true,
        wouldSummarize: result.wouldSummarize,
        trigger: result.trigger,
        allTriggers: result.allTriggers,
      }),
    );
    return;
  }
  success(
    `slack_thread_eval thread=${result.threadId} would_summarize=${result.wouldSummarize} trigger=${result.trigger}`,
  );
}

function parseNonNegativeInt(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
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

  // Phase 1 §a.3: slack-thread heuristic eval logging. The writer (when
  // ARETE_SLACK_SUMMARIES=1) is wired separately in the slack-digest
  // skill; this command logs the WOULD-decision unconditionally so
  // shadow-run analysis works.
  log
    .command('slack-thread')
    .description('Log slack-thread substantial-heuristic eval (Phase 1 shadow run)')
    .requiredOption('--thread <id>', 'Stable thread id (channel + ts)')
    .requiredOption('--messages <n>', 'Number of messages in thread')
    .requiredOption('--participants <n>', 'Number of distinct participants')
    .option('--decision', 'Decision/commitment detected in thread')
    .option('--user-flag', 'User explicitly flagged this thread')
    .option('--json', 'Output as JSON')
    .action(async (opts: SlackEvalCliOptions) => {
      await runSlackThreadEval(opts, deps);
    });
}
