/**
 * arete events log — thin CLI wrapper over MemoryLogService.append for
 * agent-driven instrumentation (Phase 0).
 *
 * Subcommands:
 *   - `events log winddown --event start|end` (Phase 0) — daily-winddown
 *     timing.
 *   - `events log deferral-disagreement --item ... --source ... --reason ...`
 *     (Phase 3.5 D3) — chef detected the user pulled back a deferred
 *     item. Wraps `MemoryLogService.appendItemFate` with fate
 *     `deferral_disagreement`.
 *   - `events log slack-thread ...` (Phase 1 §a.3) — slack heuristic
 *     eval logging.
 *
 * Adding more event types later is a matter of adding subcommands;
 * grammar enforcement and append atomicity live in core.
 */

import type { Command } from 'commander';
import {
  createServices,
  evaluateSlackThread,
  parseApprovedSection,
  type SlackThreadEvalInput,
} from '@arete/core';
import { error as printError, success } from '../formatters.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { parse as parseYaml } from 'yaml';

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
// D3 — `arete events log deferral-disagreement` (Phase 3.5)
// ---------------------------------------------------------------------------

export interface DeferralDisagreementOptions {
  item?: string;
  source?: string;
  reason?: string;
  /** ISO-8601 timestamp at which the user pulled the item back. Optional. */
  pulledBackAt?: string;
  /** Item kind (action_item | decision | learning). Defaults to 'action_item'. */
  kind?: 'action_item' | 'decision' | 'learning';
  json?: boolean;
}

/**
 * Phase 3.5 D3 — append a `deferral_disagreement` event to
 * `.arete/memory/item-fates.jsonl`. Triggered when the chef detects
 * that the user pulled a previously-deferred item back from the
 * sidecar (D2 wiring).
 *
 * Required: `--item <text>`, `--source <sidecar-path>`,
 * `--reason <original-reason>`. Optional: `--kind`, `--pulled-back-at`.
 */
export async function runDeferralDisagreementLog(
  opts: DeferralDisagreementOptions,
  deps: EventsCommandDeps = {},
): Promise<void> {
  const item = (opts.item ?? '').trim();
  const source = (opts.source ?? '').trim();
  const reason = (opts.reason ?? '').trim();
  if (item.length === 0 || source.length === 0 || reason.length === 0) {
    const msg = '--item, --source, and --reason are all required';
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }

  const kind = opts.kind ?? 'action_item';
  if (kind !== 'action_item' && kind !== 'decision' && kind !== 'learning') {
    const msg = `--kind must be one of action_item|decision|learning (got: ${String(opts.kind)})`;
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }

  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();
  if (!root) {
    if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    else printError('Not in an Areté workspace');
    process.exit(1);
  }

  const paths = services.workspace.getPaths(root);
  await services.memoryLog.appendItemFate(
    paths,
    {
      item_text: item,
      item_kind: kind,
      // Normalize source path: relative to workspace root when possible.
      source_path: workspaceRelativePath(root, source),
      fate: 'deferral_disagreement',
      reason,
      confidence: null,
      importance_at_extraction: null,
      original_fate: 'deferred',
      pulled_back_at: opts.pulledBackAt,
    },
    { now: deps.now },
  );

  if (opts.json) {
    console.log(
      JSON.stringify({
        success: true,
        fate: 'deferral_disagreement',
        item_kind: kind,
      }),
    );
    return;
  }
  success(`Logged deferral_disagreement for item from ${source}`);
}

function workspaceRelativePath(workspaceRoot: string, p: string): string {
  if (!isAbsolute(p)) return p;
  const rel = relative(workspaceRoot, p);
  // If outside the workspace, keep the absolute path; never produce a
  // path with `..` segments that the consumer might mis-resolve.
  return rel.startsWith('..') ? p : rel;
}

// ---------------------------------------------------------------------------
// D4 — `arete events backfill item-fates --since <date>` (Phase 3.5)
// ---------------------------------------------------------------------------

export interface BackfillItemFatesOptions {
  since?: string;
  /** Optional clock override (used to interpret relative `--since` values). */
  json?: boolean;
}

/**
 * Phase 3.5 D4 — scan approved meeting frontmatters in a window and
 * emit `item_fate` events for each item that lives in the body's
 * `## Approved Action Items / Decisions / Learnings` sections but is
 * NOT yet recorded in `item-fates.jsonl`. Idempotent (won't double-
 * emit). Recovery primitive for any future event-write gap.
 *
 * `--since <date>` accepts:
 *   - ISO date `YYYY-MM-DD`
 *   - Relative `Nd` (last N days)
 *   - Relative `Nw` (last N weeks)
 */
export async function runBackfillItemFates(
  opts: BackfillItemFatesOptions,
  deps: EventsCommandDeps = {},
): Promise<{
  scanned: number;
  alreadyRecorded: number;
  emitted: number;
  meetingsTouched: string[];
}> {
  const sinceRaw = (opts.since ?? '').trim();
  if (sinceRaw.length === 0) {
    const msg = '--since <date> is required (YYYY-MM-DD, Nd, or Nw)';
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }
  const now = deps.now ?? new Date();
  const sinceDate = parseSinceDate(sinceRaw, now);
  if (!sinceDate) {
    const msg = `--since must be YYYY-MM-DD, Nd, or Nw (got: ${sinceRaw})`;
    if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
    else printError(msg);
    process.exit(1);
  }

  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();
  if (!root) {
    if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    else printError('Not in an Areté workspace');
    process.exit(1);
  }

  const paths = services.workspace.getPaths(root);
  const existingFates = readExistingFateKeys(paths.memory);

  const meetingsDir = join(root, 'resources', 'meetings');
  let scanned = 0;
  let alreadyRecorded = 0;
  let emitted = 0;
  const meetingsTouched = new Set<string>();

  if (existsSync(meetingsDir)) {
    const meetings = listMeetingFilesSince(meetingsDir, sinceDate);
    for (const meetingPath of meetings) {
      scanned += 1;
      const content = readFileSync(meetingPath, 'utf8');
      const fmAndBody = splitFrontmatterAndBody(content);
      if (!fmAndBody) continue;
      const { frontmatter, body } = fmAndBody;
      const importance = (frontmatter.importance as string | undefined) ?? null;
      const importanceTyped =
        importance === 'light' || importance === 'normal' ||
        importance === 'important' || importance === 'skip'
          ? importance
          : null;
      const sourceRel = workspaceRelativePath(root, meetingPath);

      const items: Array<{ kind: 'action_item' | 'decision' | 'learning'; text: string }> = [];
      for (const text of parseApprovedSection(body, 'Action Items')) {
        items.push({ kind: 'action_item', text });
      }
      for (const text of parseApprovedSection(body, 'Decisions')) {
        items.push({ kind: 'decision', text });
      }
      for (const text of parseApprovedSection(body, 'Learnings')) {
        items.push({ kind: 'learning', text });
      }

      let touched = false;
      for (const it of items) {
        const dedupKey = fateDedupKey(sourceRel, it.kind, it.text, 'approved');
        if (existingFates.has(dedupKey)) {
          alreadyRecorded += 1;
          continue;
        }
        await services.memoryLog.appendItemFate(
          paths,
          {
            item_text: it.text,
            item_kind: it.kind,
            source_path: sourceRel,
            fate: 'approved',
            reason: 'backfilled',
            confidence: null,
            importance_at_extraction: importanceTyped,
          },
          { now: deps.now },
        );
        existingFates.add(dedupKey);
        emitted += 1;
        touched = true;
      }
      if (touched) meetingsTouched.add(sourceRel);
    }
  }

  const summary = {
    scanned,
    alreadyRecorded,
    emitted,
    meetingsTouched: Array.from(meetingsTouched).sort(),
  };

  if (opts.json) {
    console.log(JSON.stringify({ success: true, ...summary }, null, 2));
    return summary;
  }

  success(
    `Backfill complete: scanned=${scanned} alreadyRecorded=${alreadyRecorded} emitted=${emitted}`,
  );
  return summary;
}

/**
 * Parse `--since`. Accepts `YYYY-MM-DD`, `Nd`, `Nw`. Returns the
 * resulting Date (UTC midnight) or null on parse error.
 */
export function parseSinceDate(raw: string, now: Date): Date | null {
  const v = raw.trim();
  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, m - 1, d));
  }
  const relMatch = v.match(/^(\d+)([dw])$/);
  if (relMatch) {
    const n = Number(relMatch[1]);
    if (!Number.isFinite(n)) return null;
    const days = relMatch[2] === 'w' ? n * 7 : n;
    const out = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ));
    out.setUTCDate(out.getUTCDate() - days);
    return out;
  }
  return null;
}

/**
 * List meeting files under `meetingsDir` whose date prefix
 * (YYYY-MM-DD) is on or after `sinceDate`. Recursive scan; matches
 * names like `2026-05-06-anthony-1-1.md` at any depth.
 */
function listMeetingFilesSince(meetingsDir: string, sinceDate: Date): string[] {
  const out: string[] = [];
  walk(meetingsDir);
  return out;

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      if (!e.endsWith('.md')) continue;
      const m = e.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) continue;
      const fileDate = new Date(Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
      ));
      if (fileDate.getTime() >= sinceDate.getTime()) {
        out.push(full);
      }
    }
  }
}

/** Split frontmatter (YAML) + body. Null if not a frontmatter file. */
function splitFrontmatterAndBody(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  try {
    const fm = (parseYaml(match[1]) as Record<string, unknown>) ?? {};
    return { frontmatter: fm, body: match[2] };
  } catch {
    return null;
  }
}

/**
 * Read existing `item-fates.jsonl` and return a set of dedup keys for
 * fast O(1) "already recorded" lookups. The dedup key is
 * `<source>::<kind>::<text>::<fate>` — the same key the backfill
 * computes per candidate item.
 */
function readExistingFateKeys(memoryDir: string): Set<string> {
  const keys = new Set<string>();
  const path = join(memoryDir, 'item-fates.jsonl');
  if (!existsSync(path)) return keys;
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return keys;
  }
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const src = typeof parsed.source_path === 'string' ? parsed.source_path : '';
      const kind = typeof parsed.item_kind === 'string' ? parsed.item_kind : '';
      const text = typeof parsed.item_text === 'string' ? parsed.item_text : '';
      const fate = typeof parsed.fate === 'string' ? parsed.fate : '';
      keys.add(fateDedupKey(src, kind, text, fate));
    } catch {
      // Skip malformed lines — they're not blocking dedup.
    }
  }
  return keys;
}

function fateDedupKey(source: string, kind: string, text: string, fate: string): string {
  // Use a separator unlikely to appear in any field.
  return `${source} ${kind} ${text} ${fate}`;
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

  // Phase 3.5 D3 — `arete events log deferral-disagreement`
  log
    .command('deferral-disagreement')
    .description(
      'Log a deferral_disagreement item-fate (chef detected user pull-back from sidecar)',
    )
    .requiredOption('--item <text>', 'Verbatim item text at fate-time')
    .requiredOption('--source <path>', 'Path of the sidecar where item was deferred')
    .requiredOption('--reason <reason>', 'Original defer reason (bias-correction target)')
    .option('--kind <kind>', 'Item kind: action_item|decision|learning', 'action_item')
    .option('--pulled-back-at <iso>', 'ISO-8601 timestamp of user pull-back')
    .option('--json', 'Output as JSON')
    .action(async (opts: DeferralDisagreementOptions) => {
      await runDeferralDisagreementLog(opts, deps);
    });

  // Phase 3.5 D4 — `arete events backfill item-fates --since <date>`
  const backfill = events
    .command('backfill')
    .description('Backfill item-fate events from on-disk sources (recovery primitive)');
  backfill
    .command('item-fates')
    .description(
      'Scan approved meeting bodies in window; emit fate=approved events for items not yet in item-fates.jsonl. Idempotent.',
    )
    .requiredOption('--since <date>', 'YYYY-MM-DD or relative Nd / Nw')
    .option('--json', 'Output as JSON')
    .action(async (opts: BackfillItemFatesOptions) => {
      await runBackfillItemFates(opts, deps);
    });
}
