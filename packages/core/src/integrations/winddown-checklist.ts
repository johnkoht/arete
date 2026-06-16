/**
 * Winddown approval-doc renderer (W1/W2 — winddown-approval-doc plan).
 *
 * Pure, deterministic functions that render staged meeting items + cross-cutting
 * proposed actions as the checkbox-approval markdown surface described in
 * `dev/work/plans/winddown-approval-doc/mockup.md`. No LLM, no I/O.
 *
 * The renderer pre-fills the agent's recommendation as `- [x]` / `- [ ]`
 * checkboxes grouped by meeting + category, stamps tier markers
 * (`[BLOCKER]` / `[high]` / `⚠`), inline skip/uncertainty reasons, and a HIDDEN
 * STABLE ANCHOR per line (`<!-- ai_001@meeting-slug -->`). The apply mapper
 * (see `winddown-apply.ts`) keys on these anchors, never on text, so editing an
 * item's text round-trips as an amendment rather than breaking the mapping.
 *
 * Pre-fill semantics (mockup §"Checkbox semantics summary"):
 *   - status 'approved'           → `[x]`
 *   - status 'skipped'            → `[ ]` + skip reason
 *   - status 'pending' + tier     → `[x]` (agent recommends keep), unless
 *                                    uncertain (⚠) → routed to "Your call",
 *                                    not pre-filled
 *   - uncertain (⚠ channel)       → "Your call" question block, never pre-filled
 *
 * Anchors:
 *   - item:   `<!-- <id>@<slug> -->`            e.g. `<!-- ai_001@anthony -->`
 *   - choice: `<!-- choice:<key> -->`           e.g. `<!-- choice:ai_007>acc2a220 -->`
 *   - action: `<!-- act:<verb>:<id> -->`        e.g. `<!-- act:resolve:d9bee08c -->`
 */

import type { StagedItem, StagedSections } from '../models/index.js';
import {
  parseStagedSections,
  parseStagedItemStatus,
  parseStagedItemImportance,
  parseStagedItemUncertain,
  parseStagedItemLinks,
  parseStagedItemSkipReason,
} from './staged-items.js';

// ---------------------------------------------------------------------------
// Input view types
// ---------------------------------------------------------------------------

/** Importance tier mirrored from single-pass `staged_item_importance`. */
export type ChecklistTier = 'blocker' | 'high' | 'normal';

/** Per-item judgment + status overlay sourced from meeting frontmatter maps. */
export interface ChecklistItemMeta {
  /** `staged_item_status[id]` — the agent's recommendation. */
  status?: 'approved' | 'skipped' | 'pending';
  /** `staged_item_importance[id]`. */
  tier?: ChecklistTier;
  /**
   * `staged_item_uncertain[id]` — presence of an entry means the ⚠ channel
   * fired. Empty string is a valid "uncertain, no reason given" entry.
   */
  uncertainReason?: string;
  /** `staged_item_skip_reason[id].reason` — inline reason on a skip line. */
  skipReason?: string;
  /** `staged_item_links[id]`. */
  links?: { continuationOf?: string; supersedes?: string };
}

/**
 * One meeting's staged items + the frontmatter overlay maps keyed by item id.
 * `slug` is the meeting file basename (without `.md`) — it forms the second
 * half of every item anchor (`<!-- ai_001@<slug> -->`) so the apply mapper can
 * resolve the line back to the right meeting file.
 */
export interface ChecklistMeeting {
  slug: string;
  title: string;
  /** Optional time/label suffix shown after the title, e.g. "(2:30p)". */
  label?: string;
  sections: StagedSections;
  meta: Record<string, ChecklistItemMeta>;
}

/**
 * An uncertain item promoted to a "Your call" question with option-checkboxes.
 * NONE pre-filled (D2) — the user must pick (or leave pending → re-asked).
 */
export interface ChecklistChoice {
  /** Short question / framing line (no checkbox). */
  question: string;
  options: Array<{
    label: string;
    /** Anchor key — rendered as `<!-- choice:<key> -->`. */
    key: string;
    /** Recommended option gets a "(recommended)" annotation, still unchecked. */
    recommended?: boolean;
  }>;
}

/**
 * A cross-cutting proposed action (resolve/create commitment, DM, jira, inbox).
 * Pre-filled with the agent's recommendation (`recommend`).
 *
 * D8: an action carrying a `body` (Slack/DM/email draft, jira title+desc)
 * renders the body as an indented fenced block under the checkbox. The anchor
 * scopes the WHOLE block; apply reads the (possibly edited) body verbatim.
 */
export interface ChecklistAction {
  /** Verb segment of the anchor, e.g. 'resolve', 'dm', 'jira', 'inbox', 'create'. */
  verb: string;
  /** Id segment of the anchor (unique within verb), e.g. a commitment id or slug. */
  id: string;
  /** One-line description shown on the checkbox line. */
  description: string;
  /** Agent recommendation: true → `[x]`, false → `[ ]` (+ reason). */
  recommend: boolean;
  /** Inline reason (shown after `— skip:` when not recommended, else after `—`). */
  reason?: string;
  /**
   * D8 editable payload. When present, rendered as an indented fenced block.
   * The label precedes the block (e.g. "edit this message before apply —
   * sent verbatim:"). Apply reads the edited body verbatim.
   */
  body?: { label?: string; text: string };
}

/** Full input view for one winddown render. */
export interface ChecklistView {
  date: string;
  /** Optional weekday label, e.g. "Tue". */
  weekday?: string;
  meetings: ChecklistMeeting[];
  /** "Your call" uncertain blocks (W2). Rendered first. */
  choices: ChecklistChoice[];
  /** Proposed actions (W2). Rendered after meetings. */
  actions: ChecklistAction[];
}

// ---------------------------------------------------------------------------
// Anchor helpers (single source of truth — apply mapper imports these)
// ---------------------------------------------------------------------------

export function itemAnchor(id: string, slug: string): string {
  return `<!-- ${id}@${slug} -->`;
}

export function choiceAnchor(key: string): string {
  return `<!-- choice:${key} -->`;
}

export function actionAnchor(verb: string, id: string): string {
  return `<!-- act:${verb}:${id} -->`;
}

/** Regexes that recover anchors from a saved doc (apply mapper). */
export const ITEM_ANCHOR_RE = /<!--\s*((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*)\s*-->/;
export const CHOICE_ANCHOR_RE = /<!--\s*choice:(\S+?)\s*-->/;
export const ACTION_ANCHOR_RE = /<!--\s*act:([a-z0-9-]+):(\S+?)\s*-->/;

// ---------------------------------------------------------------------------
// Pre-fill + marker logic
// ---------------------------------------------------------------------------

/** True when the ⚠ channel fired for this item (routes to "Your call"). */
export function isUncertain(meta: ChecklistItemMeta | undefined): boolean {
  return meta !== undefined && meta.uncertainReason !== undefined;
}

/**
 * Decide the pre-fill checkbox state for a per-meeting item.
 * `[x]` (keep/approve) vs `[ ]` (skip). Uncertain items are handled out of
 * band (Your-call block) and should not be passed here.
 */
export function prefillChecked(meta: ChecklistItemMeta | undefined): boolean {
  if (!meta) return true; // no overlay → agent keeps by default (legacy-ish)
  if (meta.status === 'skipped') return false;
  if (meta.status === 'approved') return true;
  // pending + a tier → agent recommends keep (mockup: blocker/high/normal pre-checked)
  return true;
}

/** Tier-prefix marker, e.g. "[BLOCKER] " / "[high] " / "" for normal. */
export function tierMarker(tier: ChecklistTier | undefined): string {
  if (tier === 'blocker') return '**[BLOCKER]** ';
  if (tier === 'high') return '**[high]** ';
  return '';
}

/** Link annotation suffix (↩ continues / ⤴ supersedes) from staged_item_links. */
export function linkSuffix(links: ChecklistItemMeta['links']): string {
  if (!links) return '';
  const parts: string[] = [];
  if (links.continuationOf) parts.push(`↩ continues ${links.continuationOf}`);
  if (links.supersedes) parts.push(`⤴ supersedes ${links.supersedes}`);
  return parts.length > 0 ? `  ${parts.join(' · ')}` : '';
}

// ---------------------------------------------------------------------------
// Tier ordering
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ChecklistTier, number> = { blocker: 0, high: 1, normal: 2 };

/**
 * Stable tier sort: blocker → high → normal, ties keep original (meeting) order.
 * Items with no tier sort as 'normal'.
 */
export function sortByTier(items: StagedItem[], meta: Record<string, ChecklistItemMeta>): StagedItem[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const ta = TIER_RANK[meta[a.item.id]?.tier ?? 'normal'];
      const tb = TIER_RANK[meta[b.item.id]?.tier ?? 'normal'];
      if (ta !== tb) return ta - tb;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------
// Line rendering
// ---------------------------------------------------------------------------

/**
 * Render a single per-meeting item line (checkbox + markers + reason + anchor).
 * Returns undefined for uncertain items (they belong in the Your-call block).
 */
function renderItemLine(item: StagedItem, slug: string, meta: ChecklistItemMeta | undefined): string {
  const checked = prefillChecked(meta);
  const box = checked ? '[x]' : '[ ]';
  const marker = tierMarker(meta?.tier);
  let text = item.text;
  // Skip reason inline (only on unchecked lines — the agent-recommended skip).
  if (!checked && meta?.skipReason) {
    text = `${text} — skip: ${meta.skipReason}`;
  }
  const link = linkSuffix(meta?.links);
  return `- ${box} ${marker}${text}${link}  ${itemAnchor(item.id, slug)}`;
}

/** Render a `### <Heading>` block for one item type, or '' if empty. */
function renderSection(
  heading: string,
  items: StagedItem[],
  slug: string,
  meta: Record<string, ChecklistItemMeta>,
): string {
  // Uncertain items are pulled into the Your-call block, not rendered here.
  const visible = items.filter((i) => !isUncertain(meta[i.id]));
  if (visible.length === 0) return '';
  const ordered = sortByTier(visible, meta);
  const lines = ordered.map((i) => renderItemLine(i, slug, meta[i.id]));
  return `### ${heading}\n${lines.join('\n')}`;
}

/** Render one meeting's three sections under its `## <title>` header. */
export function renderMeeting(meeting: ChecklistMeeting): string {
  const header = meeting.label
    ? `## ${meeting.title}   ·   ${meeting.label}`
    : `## ${meeting.title}`;
  const blocks = [
    renderSection('Action items', meeting.sections.actionItems, meeting.slug, meeting.meta),
    renderSection('Decisions', meeting.sections.decisions, meeting.slug, meeting.meta),
    renderSection('Learnings', meeting.sections.learnings, meeting.slug, meeting.meta),
  ].filter((b) => b !== '');
  if (blocks.length === 0) return '';
  return `${header}\n\n${blocks.join('\n\n')}`;
}

/**
 * Public W1 entry point: render ONE meeting's staged items as the checklist
 * markdown surface. Unit-tested directly on fixtures.
 */
export function renderStagedItemsAsChecklist(meeting: ChecklistMeeting): string {
  return renderMeeting(meeting);
}

// ---------------------------------------------------------------------------
// "Your call" + actions blocks (W2)
// ---------------------------------------------------------------------------

/** Render the uncertain items already in `view.choices` as a Your-call block. */
export function renderChoices(choices: ChecklistChoice[]): string {
  if (choices.length === 0) return '';
  const blocks = choices.map((c) => {
    const opts = c.options
      .map((o) => {
        const rec = o.recommended ? ' (recommended)' : '';
        return `   - [ ] ${o.label}${rec}   ${choiceAnchor(o.key)}`;
      })
      .join('\n');
    return `⚠ ${c.question}\n${opts}`;
  });
  return `## ⛔ Blockers & ⚠ Your call first   (decide these — not pre-filled)\n\n${blocks.join('\n\n')}`;
}

/**
 * Render an uncertain PER-MEETING item as a Your-call question (W2).
 * The single "keep / skip" decision is offered as two choice options whose
 * anchors carry the item id so apply can resolve them back to the meeting.
 */
export function uncertainItemToChoice(item: StagedItem, slug: string, meta: ChecklistItemMeta): ChecklistChoice {
  const reason = meta.uncertainReason && meta.uncertainReason.trim() !== ''
    ? ` — ${meta.uncertainReason}`
    : '';
  return {
    question: `**${item.text}**${reason} — keep or skip?`,
    options: [
      { label: 'keep (stage it)', key: `${item.id}@${slug}:keep` },
      { label: 'skip', key: `${item.id}@${slug}:skip` },
    ],
  };
}

/** Render the proposed-actions block (W2 + D8 editable bodies). */
export function renderActions(actions: ChecklistAction[]): string {
  if (actions.length === 0) return '';
  const lines = actions.map((a) => {
    const box = a.recommend ? '[x]' : '[ ]';
    let head = `- ${box} ${a.description}`;
    if (a.reason) {
      head += a.recommend ? ` — ${a.reason}` : ` — skip: ${a.reason}`;
    }
    head += `  ${actionAnchor(a.verb, a.id)}`;
    if (a.body) {
      const label = a.body.label ?? 'edit before apply — used verbatim:';
      // Indented fenced block scoped by the action anchor above.
      const fenced = a.body.text
        .split('\n')
        .map((l) => `      > ${l}`)
        .join('\n');
      head += `\n      > _${label}_\n      > \`\`\`\n${fenced}\n      > \`\`\``;
    }
    return head;
  });
  return `## Proposed actions   (cross-cutting — same check-to-do)\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Full doc render
// ---------------------------------------------------------------------------

/**
 * Render the full winddown approval doc body (header + Your-call + meetings +
 * actions). This is the agent-written BASELINE that apply diffs against.
 *
 * Uncertain per-meeting items are auto-promoted into the Your-call block
 * (merged ahead of any explicit `view.choices`) so the surface always forces a
 * pick for ⚠ items (D2/D5).
 */
export function renderWinddownDoc(view: ChecklistView): string {
  // Promote uncertain per-meeting items into choices.
  const autoChoices: ChecklistChoice[] = [];
  for (const m of view.meetings) {
    const all = [
      ...m.sections.actionItems,
      ...m.sections.decisions,
      ...m.sections.learnings,
    ];
    for (const item of all) {
      const meta = m.meta[item.id];
      if (isUncertain(meta)) autoChoices.push(uncertainItemToChoice(item, m.slug, meta));
    }
  }
  const allChoices = [...view.choices, ...autoChoices];

  const dateLabel = view.weekday ? `${view.date} (${view.weekday})` : view.date;
  const parts: string[] = [`# Daily Winddown — ${dateLabel}   ·   review & apply`];
  parts.push(
    '> ☑ leave checked to accept · ☐ uncheck to reject · edit text to amend ·\n' +
    '> `/winddown apply` when done (shows a summary, confirms, then executes).',
  );

  const choicesBlock = renderChoices(allChoices);
  if (choicesBlock) parts.push(choicesBlock);

  for (const m of view.meetings) {
    const block = renderMeeting(m);
    if (block) parts.push(block);
  }

  const actionsBlock = renderActions(view.actions);
  if (actionsBlock) parts.push(actionsBlock);

  return parts.join('\n\n---\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// View builder — frontmatter + body → ChecklistMeeting (deterministic, no I/O)
// ---------------------------------------------------------------------------

/**
 * Build the per-meeting `ChecklistMeeting` portion of a `ChecklistView` from a
 * meeting file's RAW markdown content (frontmatter + body). Pure: the caller
 * reads the file; this assembles the staged sections + the overlay maps the
 * renderer consumes. Mirrors the single_pass writer keys:
 *   - `staged_item_status`     → ChecklistItemMeta.status
 *   - `staged_item_importance` → .tier
 *   - `staged_item_uncertain`  → .uncertainReason (presence ⇒ ⚠ channel)
 *   - `staged_item_skip_reason`→ .skipReason (the `.reason` field)
 *   - `staged_item_links`      → .links
 *
 * `slug` forms the second half of every item anchor (`<!-- ai_001@<slug> -->`)
 * so the apply mapper resolves the line back to this meeting file.
 */
export function buildChecklistMeeting(
  content: string,
  meta: { slug: string; title: string; label?: string },
): ChecklistMeeting {
  // parseStagedSections takes the BODY; the frontmatter parsers take full content.
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  const body = fmMatch ? fmMatch[1] : content;
  const sections = parseStagedSections(body);

  const status = parseStagedItemStatus(content);
  const importance = parseStagedItemImportance(content);
  const uncertain = parseStagedItemUncertain(content);
  const links = parseStagedItemLinks(content);
  const skipReason = parseStagedItemSkipReason(content);

  const itemMeta: Record<string, ChecklistItemMeta> = {};
  const allIds = [
    ...sections.actionItems,
    ...sections.decisions,
    ...sections.learnings,
  ].map((i) => i.id);

  for (const id of allIds) {
    const m: ChecklistItemMeta = {};
    if (status[id]) m.status = status[id];
    if (importance[id]) m.tier = importance[id];
    // PRESENCE in the uncertain map (even empty string) ⇒ ⚠ channel fired.
    if (Object.prototype.hasOwnProperty.call(uncertain, id)) m.uncertainReason = uncertain[id];
    if (skipReason[id]) m.skipReason = skipReason[id].reason;
    if (links[id]) m.links = links[id];
    itemMeta[id] = m;
  }

  return { slug: meta.slug, title: meta.title, label: meta.label, sections, meta: itemMeta };
}

/**
 * Render only the deterministic staged-items/decisions/learnings + auto-promoted
 * "Your call" surface for a set of meetings — WITHOUT the doc title/legend
 * header or proposed-actions block. This is the block the agent splices into the
 * curated view as `## Stage for approval`, AND the verbatim baseline `apply`
 * diffs against (apply keys on hidden anchors, ignoring narrative lines).
 *
 * Uncertain per-meeting items are promoted into a leading Your-call block, same
 * as `renderWinddownDoc`, so ⚠ items always force a pick.
 */
export function renderStagedBlock(meetings: ChecklistMeeting[]): string {
  const autoChoices: ChecklistChoice[] = [];
  for (const m of meetings) {
    const all = [...m.sections.actionItems, ...m.sections.decisions, ...m.sections.learnings];
    for (const item of all) {
      const meta = m.meta[item.id];
      if (isUncertain(meta)) autoChoices.push(uncertainItemToChoice(item, m.slug, meta as ChecklistItemMeta));
    }
  }

  const parts: string[] = [];
  const choicesBlock = renderChoices(autoChoices);
  if (choicesBlock) parts.push(choicesBlock);
  for (const m of meetings) {
    const block = renderMeeting(m);
    if (block) parts.push(block);
  }
  return parts.join('\n\n---\n\n') + (parts.length > 0 ? '\n' : '');
}
