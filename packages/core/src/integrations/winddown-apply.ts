/**
 * Winddown approval-doc apply mapper (W3/W4 — winddown-approval-doc plan).
 *
 * Reads a SAVED winddown approval doc (the user has toggled checkboxes / edited
 * text), maps every checkbox / choice / action back to its hidden anchor id,
 * diffs against the agent-written BASELINE (persisted at render time), and
 * classifies each line into an apply decision. Pure functions for parse + diff
 * + classify + summary; `executeWinddownApply` performs the mutations via
 * injected primitives (no direct service deps in this module).
 *
 * Round-trip safety (W4):
 *   - Anchors are the key, never text — editing an item's text round-trips as
 *     an amendment (`edited`), not a broken mapping.
 *   - unchecked an `[x]` → `user-override` (skip, reason "user-rejected").
 *   - checked a `[ ]`    → `rescue` (approve, overrides the agent skip).
 *   - text changed, anchor intact → `edited` (amendment → staged_item_edits).
 *   - malformed / missing / unknown anchor → surfaced in `warnings`, NEVER
 *     silently dropped or mis-applied.
 *   - idempotent: re-apply over an already-applied day mutates nothing (the
 *     R7 resolvedAt guard + meeting `status: approved` guard live in the deps).
 *
 * No LLM. Parse/diff/classify/render are deterministic over the doc text.
 */

import {
  ITEM_ANCHOR_RE,
  CHOICE_ANCHOR_RE,
  ACTION_ANCHOR_RE,
} from './winddown-checklist.js';

// ---------------------------------------------------------------------------
// Parse model
// ---------------------------------------------------------------------------

/** A single parsed checkbox/choice/action line keyed by its anchor. */
export interface ParsedLine {
  kind: 'item' | 'choice' | 'action';
  /** Stable anchor id used as the diff key. */
  anchor: string;
  /** `[x]` → true, `[ ]` → false. */
  checked: boolean;
  /** Visible text with the checkbox, markers, reason, and anchor stripped. */
  text: string;
  /** For items: the staged item id (ai_001) + meeting slug. */
  itemId?: string;
  meetingSlug?: string;
  /** For choices: the choice key (everything after `choice:`). */
  choiceKey?: string;
  /** For actions: verb + id segments. */
  verb?: string;
  actionId?: string;
  /** D8: the (possibly edited) action body text, fenced block stripped. */
  body?: string;
}

export interface ParsedWinddownDoc {
  /** anchor → parsed line. */
  byAnchor: Map<string, ParsedLine>;
  /**
   * Checkbox lines whose anchor could not be recovered (malformed / removed).
   * Surfaced in the summary so they are never silently mis-applied (AC2).
   */
  malformed: string[];
}

const CHECKBOX_RE = /^\s*-\s*\[([ xX])\]\s*(.*)$/;

/** Strip markdown emphasis + tier markers + inline reason from item/action text. */
function cleanText(raw: string): string {
  let t = raw;
  // Drop the trailing anchor if present.
  t = t.replace(/<!--[^>]*-->\s*$/, '').trimEnd();
  // Drop tier markers.
  t = t.replace(/\*\*\[(?:BLOCKER|high)\]\*\*\s*/gi, '');
  // Drop the agent's inline "— skip: <reason>" / link annotations are kept in
  // text? No — link annotations (↩/⤴) are agent-authored decoration; strip the
  // trailing "  ↩ continues ..." / "  ⤴ supersedes ..." run.
  t = t.replace(/\s{2,}(?:↩ continues|⤴ supersedes)[^]*$/u, '');
  // Strip a trailing "— skip: ..." reason clause (agent decoration, not user text).
  t = t.replace(/\s+—\s+skip:\s.*$/u, '');
  return t.trim();
}

/**
 * Parse a fenced editable body block (D8) that follows an action line.
 * Lines look like `      > text` with a `      > ``` ` fence. Returns the
 * inner text (fence + blockquote prefix removed) or undefined if none.
 */
function parseActionBody(lines: string[], startIdx: number): { body?: string; nextIdx: number } {
  let i = startIdx;
  // Skip an optional label line: `      > _edit ..._`
  // Find the opening fence.
  let opened = false;
  const bodyLines: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/^\s*>\s?/, '');
    const isBlockquote = /^\s*>/.test(line);
    if (!isBlockquote) break; // body block ended
    if (/^```/.test(stripped.trim())) {
      if (!opened) {
        opened = true;
        i++;
        continue;
      } else {
        i++; // closing fence
        break;
      }
    }
    if (opened) {
      bodyLines.push(stripped);
    }
    i++;
  }
  if (!opened) return { nextIdx: startIdx };
  return { body: bodyLines.join('\n'), nextIdx: i };
}

/**
 * Parse a saved winddown approval doc into a keyed line map.
 * Handles item / choice / action checkboxes + D8 action bodies.
 */
export function parseWinddownDoc(markdown: string): ParsedWinddownDoc {
  const byAnchor = new Map<string, ParsedLine>();
  const malformed: string[] = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(CHECKBOX_RE);
    if (!m) continue;
    const checked = m[1].toLowerCase() === 'x';
    const rest = m[2];

    const itemM = rest.match(ITEM_ANCHOR_RE);
    const choiceM = rest.match(CHOICE_ANCHOR_RE);
    const actionM = rest.match(ACTION_ANCHOR_RE);

    if (itemM) {
      const anchor = `${itemM[1]}@${itemM[2]}`;
      byAnchor.set(anchor, {
        kind: 'item',
        anchor,
        checked,
        text: cleanText(rest),
        itemId: itemM[1],
        meetingSlug: itemM[2],
      });
    } else if (choiceM) {
      const anchor = `choice:${choiceM[1]}`;
      byAnchor.set(anchor, {
        kind: 'choice',
        anchor,
        checked,
        text: cleanText(rest),
        choiceKey: choiceM[1],
      });
    } else if (actionM) {
      const anchor = `act:${actionM[1]}:${actionM[2]}`;
      const parsed: ParsedLine = {
        kind: 'action',
        anchor,
        checked,
        text: cleanText(rest),
        verb: actionM[1],
        actionId: actionM[2],
      };
      // Look ahead for a D8 editable body block.
      const { body, nextIdx } = parseActionBody(lines, i + 1);
      if (body !== undefined) {
        parsed.body = body;
        i = nextIdx - 1;
      }
      byAnchor.set(anchor, parsed);
    } else {
      // A checkbox line with NO recoverable anchor — never silently drop (AC2).
      malformed.push(line.trim());
    }
  }

  return { byAnchor, malformed };
}

// ---------------------------------------------------------------------------
// Classification (diff edited vs baseline)
// ---------------------------------------------------------------------------

export type ItemDecision =
  | 'approve' // baseline [x], still [x]
  | 'skip' // baseline [ ], still [ ] (agent skip stands)
  | 'user-override' // baseline [x], user unchecked → skip (reason "user-rejected")
  | 'rescue'; // baseline [ ], user checked → approve (overrides agent)

export interface ItemClassification {
  itemId: string;
  meetingSlug: string;
  decision: ItemDecision;
  /** True when the visible text differs from the baseline (amendment). */
  edited: boolean;
  baselineText: string;
  editedText: string;
}

export interface ChoiceClassification {
  choiceKey: string;
  /** True when exactly this option is checked. */
  chosen: boolean;
}

export interface ActionClassification {
  verb: string;
  actionId: string;
  /** Final user intent: execute (checked) or skip (unchecked). */
  execute: boolean;
  /** Whether the user changed the checkbox vs baseline. */
  toggled: boolean;
  /** D8: final (possibly edited) body, when the action carries one. */
  body?: string;
  bodyEdited: boolean;
  baselineBody?: string;
}

export interface WinddownApplyPlan {
  date: string;
  items: ItemClassification[];
  choices: ChoiceClassification[];
  actions: ActionClassification[];
  /**
   * Lines present in the edited doc that map to no baseline anchor, plus any
   * malformed (anchorless) checkbox lines — surfaced, never applied (AC2).
   */
  warnings: string[];
}

function classifyItem(decisionBaseline: boolean, edited: boolean): ItemDecision {
  if (decisionBaseline && edited) return 'approve';
  if (!decisionBaseline && !edited) return 'skip';
  if (decisionBaseline && !edited) return 'user-override';
  return 'rescue'; // !baseline && edited
}

/**
 * Diff a saved doc against the agent baseline and produce the apply plan.
 * Both docs are parsed; classification keys on anchors.
 */
export function buildApplyPlan(
  date: string,
  baselineMarkdown: string,
  editedMarkdown: string,
): WinddownApplyPlan {
  const baseline = parseWinddownDoc(baselineMarkdown);
  const edited = parseWinddownDoc(editedMarkdown);

  const items: ItemClassification[] = [];
  const choices: ChoiceClassification[] = [];
  const actions: ActionClassification[] = [];
  const warnings: string[] = [];

  for (const m of edited.malformed) {
    warnings.push(`malformed line (no recoverable anchor): ${m}`);
  }

  for (const [anchor, eLine] of edited.byAnchor) {
    const bLine = baseline.byAnchor.get(anchor);
    if (!bLine) {
      warnings.push(`unknown anchor not in baseline: ${anchor}`);
      continue;
    }
    if (eLine.kind === 'item') {
      items.push({
        itemId: eLine.itemId!,
        meetingSlug: eLine.meetingSlug!,
        decision: classifyItem(bLine.checked, eLine.checked),
        edited: eLine.text !== bLine.text,
        baselineText: bLine.text,
        editedText: eLine.text,
      });
    } else if (eLine.kind === 'choice') {
      choices.push({ choiceKey: eLine.choiceKey!, chosen: eLine.checked });
    } else {
      actions.push({
        verb: eLine.verb!,
        actionId: eLine.actionId!,
        execute: eLine.checked,
        toggled: eLine.checked !== bLine.checked,
        body: eLine.body,
        bodyEdited: eLine.body !== undefined && eLine.body !== bLine.body,
        baselineBody: bLine.body,
      });
    }
  }

  return { date, items, choices, actions, warnings };
}

// ---------------------------------------------------------------------------
// Confirm summary
// ---------------------------------------------------------------------------

/**
 * Render the human confirm summary (counts + edited diffs + final outbound text
 * for message actions). AC5/AC5b: the summary must match the executed mutations
 * exactly — it is computed from the SAME plan execute() consumes.
 */
export function renderApplySummary(plan: WinddownApplyPlan): string {
  const approve = plan.items.filter((i) => i.decision === 'approve' || i.decision === 'rescue');
  const skip = plan.items.filter((i) => i.decision === 'skip' || i.decision === 'user-override');
  const rescued = plan.items.filter((i) => i.decision === 'rescue');
  const overridden = plan.items.filter((i) => i.decision === 'user-override');
  const editedItems = plan.items.filter((i) => i.edited);
  const choicesResolved = plan.choices.filter((c) => c.chosen);
  const actionsExec = plan.actions.filter((a) => a.execute);
  const actionsSkipped = plan.actions.filter((a) => !a.execute);
  const editedActions = plan.actions.filter((a) => a.bodyEdited);

  const lines: string[] = [];
  lines.push(`Apply winddown ${plan.date}?`);
  lines.push(
    `  ✔ ${approve.length} items → staged/approved` +
      `      ✗ ${skip.length} items → skipped`,
  );
  if (rescued.length > 0) {
    lines.push(`  ↑ ${rescued.length} rescued (you re-checked an agent skip)`);
  }
  if (overridden.length > 0) {
    lines.push(`  ↓ ${overridden.length} user-rejected (you unchecked an agent keep)`);
  }
  // Action breakdown by verb.
  if (plan.actions.length > 0) {
    const byVerb = new Map<string, number>();
    for (const a of actionsExec) byVerb.set(a.verb, (byVerb.get(a.verb) ?? 0) + 1);
    const verbStr = [...byVerb.entries()].map(([v, n]) => `${n} ${v}`).join(', ');
    lines.push(
      `  ${plan.actions.length} actions: ${verbStr || 'none'}` +
        (actionsSkipped.length > 0 ? `, ${actionsSkipped.length} you deferred` : ''),
    );
  }
  if (choicesResolved.length > 0) {
    lines.push(`  ${choicesResolved.length} your-call → resolved as marked`);
  }
  // Edited item diffs.
  for (const it of editedItems) {
    lines.push(`  ⚠ edited ${it.itemId}@${it.meetingSlug}: "${it.baselineText}" → "${it.editedText}"`);
  }
  // AC5b — echo the FINAL outbound text for message-sending actions.
  for (const a of actionsExec) {
    if (a.body !== undefined) {
      const tag = a.bodyEdited ? ' (edited)' : '';
      lines.push(`  ✉ ${a.verb}:${a.actionId} final text${tag}:`);
      for (const bl of a.body.split('\n')) lines.push(`      ${bl}`);
    }
  }
  // Warnings — surfaced, never silently applied.
  for (const w of plan.warnings) {
    lines.push(`  ⚠ ${w}`);
  }
  lines.push('Proceed? [y/N]');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/**
 * Injected primitives — keeps this module free of direct service deps and lets
 * the CLI wire real services / tests wire fakes. Mutations route through the
 * EXISTING primitives (meeting approve/skip status writes, commitments
 * resolve/create, action drafts).
 */
export interface WinddownApplyDeps {
  /**
   * Set a staged item's status (+ optional edited text) on its meeting file.
   * Wraps `writeItemStatusToFile`.
   */
  setItemStatus: (
    meetingSlug: string,
    itemId: string,
    status: 'approved' | 'skipped',
    opts?: { editedText?: string; skipReason?: string },
  ) => Promise<void>;
  /**
   * Commit all approved items for a meeting (wraps `commitApprovedItems`).
   * Called once per touched meeting AFTER per-item statuses are written.
   * MUST be a no-op when the meeting is already approved (idempotency) and
   * signal that via the return value: `'committed'` when it mutated,
   * `'already-applied'` when it no-op'd. The engine counts only real commits.
   */
  commitMeeting: (meetingSlug: string) => Promise<'committed' | 'already-applied'>;
  /**
   * Resolve a commitment. MUST honor the R7 idempotency guard — return
   * `'already-resolved'` (no mutation) when the commitment is already resolved.
   */
  resolveCommitment: (id: string) => Promise<'resolved' | 'already-resolved'>;
  /** Create a commitment (for `act:create:*`). */
  createCommitment?: (text: string) => Promise<void>;
  /**
   * Produce/queue an outbound draft (DM/Slack/email/jira/inbox). Does NOT send
   * — the chef executes through MCP. `body` is the FINAL (possibly edited)
   * verbatim payload (D8 / AC5b).
   */
  draftAction?: (verb: string, id: string, body?: string) => Promise<void>;
}

export interface WinddownApplyResult {
  approvedItems: number;
  skippedItems: number;
  rescuedItems: number;
  overriddenItems: number;
  editedItems: number;
  meetingsCommitted: string[];
  resolvedCommitments: string[];
  alreadyResolved: string[];
  createdCommitments: number;
  draftedActions: number;
  choicesResolved: number;
  warnings: string[];
}

/**
 * Execute the apply plan via injected primitives. Idempotent: re-running over
 * an already-applied day mutates nothing (deps enforce the guards).
 *
 * Order: per-item statuses first (grouped by meeting), then commit each touched
 * meeting once, then choices, then actions.
 */
export async function executeWinddownApply(
  plan: WinddownApplyPlan,
  deps: WinddownApplyDeps,
): Promise<WinddownApplyResult> {
  const result: WinddownApplyResult = {
    approvedItems: 0,
    skippedItems: 0,
    rescuedItems: 0,
    overriddenItems: 0,
    editedItems: 0,
    meetingsCommitted: [],
    resolvedCommitments: [],
    alreadyResolved: [],
    createdCommitments: 0,
    draftedActions: 0,
    choicesResolved: 0,
    warnings: [...plan.warnings],
  };

  // ── Items: write statuses grouped by meeting, then commit each once ──
  const touchedMeetings = new Set<string>();
  for (const it of plan.items) {
    const editedText = it.edited ? it.editedText : undefined;
    if (it.decision === 'approve' || it.decision === 'rescue') {
      await deps.setItemStatus(it.meetingSlug, it.itemId, 'approved', { editedText });
      result.approvedItems++;
      if (it.decision === 'rescue') result.rescuedItems++;
    } else {
      // skip or user-override
      const skipReason = it.decision === 'user-override' ? 'user-rejected' : undefined;
      await deps.setItemStatus(it.meetingSlug, it.itemId, 'skipped', { editedText, skipReason });
      result.skippedItems++;
      if (it.decision === 'user-override') result.overriddenItems++;
    }
    if (it.edited) result.editedItems++;
    touchedMeetings.add(it.meetingSlug);
  }
  for (const slug of touchedMeetings) {
    const outcome = await deps.commitMeeting(slug);
    if (outcome === 'committed') result.meetingsCommitted.push(slug);
  }

  // ── Choices: a chosen option whose key encodes an item decision ──
  // Keys of the form `<itemId>@<slug>:keep|skip` resolve the underlying item.
  for (const c of plan.choices) {
    if (!c.chosen) continue;
    result.choicesResolved++;
    const m = c.choiceKey.match(/^((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*):(keep|skip)$/);
    if (m) {
      const [, itemId, slug, branch] = m;
      await deps.setItemStatus(slug, itemId, branch === 'keep' ? 'approved' : 'skipped', {
        skipReason: branch === 'skip' ? 'user-rejected' : undefined,
      });
      if (!touchedMeetings.has(slug)) {
        const outcome = await deps.commitMeeting(slug);
        if (outcome === 'committed') result.meetingsCommitted.push(slug);
        touchedMeetings.add(slug);
      }
    }
    // Non-item choice keys (mirror/cal/etc.) are recorded as resolved; their
    // execution is chef-orchestrated (no generic primitive). Surfaced count
    // only — the chef reads the chosen key from the doc.
  }

  // ── Actions: route by verb through injected primitives ──
  for (const a of plan.actions) {
    if (!a.execute) continue;
    if (a.verb === 'resolve') {
      const outcome = await deps.resolveCommitment(a.actionId);
      if (outcome === 'resolved') result.resolvedCommitments.push(a.actionId);
      else result.alreadyResolved.push(a.actionId);
    } else if (a.verb === 'create' && deps.createCommitment) {
      await deps.createCommitment(a.body ?? a.actionId);
      result.createdCommitments++;
    } else if (deps.draftAction) {
      await deps.draftAction(a.verb, a.actionId, a.body);
      result.draftedActions++;
    }
  }

  return result;
}
