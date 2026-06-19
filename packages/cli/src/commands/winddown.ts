/**
 * `arete winddown apply <date>` — winddown approval-doc apply mapper (W3).
 *
 * Reads the saved approval doc + the persisted agent baseline, builds the apply
 * plan (parse → anchor map → diff → classify), prints the CONFIRM SUMMARY, and
 * on `y` executes via EXISTING primitives:
 *   - meeting items → `writeItemStatusToFile` + `commitApprovedItems`
 *   - `act:resolve:<id>` → `commitments.resolve` (R7 idempotency guard)
 *   - other actions (DM/Slack/email/jira/inbox) → drafted, NOT sent — the chef
 *     executes through MCP as today; the EDITED BODY flows through verbatim.
 *
 * Idempotent: re-apply over an already-applied day mutates nothing (meeting
 * already `status: approved` → commit no-ops; commitment already resolved →
 * R7 guard).
 */

import { join, basename, isAbsolute } from 'node:path';
import {
  createServices,
  loadConfig,
  buildApplyPlan,
  parseWinddownDoc,
  renderApplySummary,
  executeWinddownApply,
  writeItemStatusToFile,
  writeItemElevatedToFile,
  removeItemElevatedFromFile,
  parseStagedSections,
  commitApprovedItems,
  parseStagedItemStatus,
  buildChecklistMeeting,
  renderStagedBlock,
  renderWinddownDoc,
  buildThemeView,
  renderThemeView,
  pickDominantTheme,
  type ChecklistMeeting,
  type ChecklistView,
  type ThemeMeetingInput,
  type WinddownApplyDeps,
} from '@arete/core';
import type { Command } from 'commander';
import { error, info, success } from '../formatters.js';

function archiveDir(now: string): string {
  return join(now, 'archive', 'daily-winddown');
}

/** Persist the agent-rendered baseline alongside the archive (called at render time). */
export function baselinePath(now: string, date: string): string {
  return join(archiveDir(now), `winddown-${date}.baseline.md`);
}

export function docPath(now: string, date: string): string {
  return join(archiveDir(now), `winddown-${date}.md`);
}

/** Weekday label (e.g. "Tue") for a YYYY-MM-DD date, locally. */
function weekdayLabel(date: string): string | undefined {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return undefined;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

/** Title from a meeting file's frontmatter, falling back to the slug. */
function titleFromContent(content: string, slug: string): string {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m);
    if (t) return t[1].trim().replace(/^["']|["']$/g, '');
  }
  return slug;
}

/** `status:` value from a meeting file's frontmatter, or null. */
function statusFromContent(content: string): string | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const s = fm[1].match(/^status:\s*(\S+)/m);
  return s ? s[1] : null;
}

/**
 * `date:` value from a meeting file's frontmatter, or undefined (theme-render
 * W3). Carried into the clusterer as `timeIso` so it orders the theme cluster
 * oldest→newest; full ISO datetime on the live MCP path, date-only on some
 * importers (the clusterer falls back to staging order when unparseable).
 */
function dateFromContent(content: string): string | undefined {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const d = fm[1].match(/^date:\s*(.+)$/m);
  if (!d) return undefined;
  const v = d[1].trim().replace(/^["']|["']$/g, '');
  return v === '' ? undefined : v;
}

/**
 * `topics:` slugs from a meeting file's frontmatter (theme-render W3). Handles
 * both block list (`topics:\n  - a\n  - b`) and inline flow (`topics: [a, b]`).
 * Returns [] when absent. The dominant entry is resolved by `pickDominantTheme`
 * against the active project/area slugs.
 */
function topicsFromContent(content: string): string[] {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const body = fm[1];
  // Inline flow form: `topics: [a, b, c]`
  const inline = body.match(/^topics:\s*\[([^\]]*)\]\s*$/m);
  if (inline) {
    return inline[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter((s) => s !== '');
  }
  // Block list form: `topics:` followed by `  - slug` lines.
  const blockHeader = body.match(/^topics:\s*$/m);
  if (!blockHeader) return [];
  const lines = body.split('\n');
  const startIdx = lines.findIndex((l) => /^topics:\s*$/.test(l));
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*(.+)$/);
    if (!m) break; // first non-list line ends the block
    out.push(m[1].trim().replace(/^["']|["']$/g, ''));
  }
  return out;
}

/**
 * List active project slugs (`projects/active/<slug>/`) and area slugs
 * (`areas/<slug>.md`, excluding templates/index) — the spine `pickDominantTheme`
 * resolves a meeting's coarse theme against (plan D2: project-primary,
 * area-fallback). Failures degrade to empty (every meeting → its first topic or
 * Uncategorized), never crash the render.
 */
async function listActiveSpine(
  storage: { listSubdirectories: (d: string) => Promise<string[]>; list: (d: string, o?: { extensions?: string[] }) => Promise<string[]> },
  root: string,
): Promise<{ projects: string[]; areas: string[] }> {
  let projects: string[] = [];
  let areas: string[] = [];
  try {
    projects = await storage.listSubdirectories(join(root, 'projects', 'active'));
  } catch {
    projects = [];
  }
  try {
    const areaFiles = await storage.list(join(root, 'areas'), { extensions: ['.md'] });
    areas = areaFiles
      .map((p) => basename(p, '.md'))
      .filter((b) => b !== 'index' && b !== '_template' && b !== 'memory');
  } catch {
    areas = [];
  }
  return { projects, areas };
}

export function registerWinddownCommand(program: Command): void {
  const winddownCmd = program
    .command('winddown')
    .description('Winddown approval-doc render + apply (checkbox review surface)');

  winddownCmd
    .command('render <date>')
    .description(
      'Render the deterministic staged-items/decisions/learnings checkbox block ' +
        'for a day (YYYY-MM-DD) from meeting frontmatter. The agent splices this ' +
        'into the curated view as `## Stage for approval`. Use --stdout (default); ' +
        'the apply baseline is the COMPLETE composed doc (cp it in Step 5), NOT the ' +
        'staged block alone — see --write.',
    )
    .option('--stdout', 'Print the rendered block to stdout (default)')
    .option(
      '--write',
      'DEPRECATED as a baseline source: writes ONLY the staged block to ' +
        'winddown-<date>.baseline.md — it omits the hand-composed ## Proposed ' +
        'actions, so apply silently drops them. The baseline must be the COMPLETE ' +
        'doc; cp winddown-<date>.md in Step 5 instead.',
    )
    .option('--json', 'Emit { view, markdown } as JSON')
    .option(
      '--view <file>',
      'Render a FULL ChecklistView (with agent-composed choices + proposed actions) ' +
        'from a JSON file instead of the frontmatter-only staged block',
    )
    .action(
      async (
        date: string,
        opts: { stdout?: boolean; write?: boolean; json?: boolean; view?: string },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          else error('Not in an Areté workspace');
          process.exit(1);
        }

        const paths = services.workspace.getPaths(root);
        const meetingsDir = join(paths.resources, 'meetings');

        let markdown: string;
        let view: ChecklistView;

        if (opts.view) {
          // FULL view path: the agent hands in choices + proposed actions.
          const viewRaw = await services.storage.read(
            opts.view.startsWith('/') ? opts.view : join(root, opts.view),
          );
          if (viewRaw === null) {
            const msg = `View file not found: ${opts.view}`;
            if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
            else error(msg);
            process.exit(1);
          }
          view = JSON.parse(viewRaw!) as ChecklistView;
          markdown = renderWinddownDoc(view);
        } else {
          // FRONTMATTER-ONLY path (no-args default): build the per-meeting
          // staged portion from `resources/meetings/<date>-*.md` (processed/
          // approved) and render the deterministic staged block.
          const allFiles = await services.storage.list(meetingsDir, { extensions: ['.md'] });
          const dayFiles = allFiles
            .filter((p) => {
              const b = basename(p);
              return b.startsWith(`${date}-`) && b !== 'index.md';
            })
            .sort((a, b) => a.localeCompare(b));

          // Determine render mode (theme-render W3). Default stays the existing
          // staged-block render; only `winddown_render: theme` switches to the
          // theme-grouped doc — checklist/prose are byte-for-byte unchanged (AC7).
          const config = await loadConfig(services.storage, root);
          const themeMode = config.winddown_render === 'theme';
          const spine = themeMode
            ? await listActiveSpine(services.storage, root)
            : { projects: [], areas: [] };

          const meetings: ChecklistMeeting[] = [];
          const themeInputs: ThemeMeetingInput[] = [];
          for (const filePath of dayFiles) {
            const content = await services.storage.read(filePath);
            if (content === null) continue;
            const status = statusFromContent(content);
            if (status !== 'processed' && status !== 'approved') continue;
            const slug = basename(filePath, '.md');
            const title = titleFromContent(content, slug);
            const cm = buildChecklistMeeting(content, { slug, title });
            // Only include meetings that actually have staged items.
            const hasItems =
              cm.sections.actionItems.length +
                cm.sections.decisions.length +
                cm.sections.learnings.length >
              0;
            if (!hasItems) continue;
            meetings.push(cm);
            if (themeMode) {
              const theme = pickDominantTheme(
                topicsFromContent(content),
                spine.projects,
                spine.areas,
              );
              themeInputs.push({ meeting: cm, theme, timeIso: dateFromContent(content) });
            }
          }

          view = {
            date,
            weekday: weekdayLabel(date),
            meetings,
            choices: [],
            actions: [],
          };
          if (themeMode) {
            const themeView = buildThemeView(themeInputs, {
              date,
              weekday: weekdayLabel(date),
            });
            markdown = renderThemeView(themeView);
          } else {
            markdown = renderStagedBlock(meetings);
          }
        }

        if (opts.write) {
          const blPath = baselinePath(paths.now, date);
          await services.storage.mkdir(archiveDir(paths.now));
          await services.storage.write(blPath, markdown);
        }

        if (opts.json) {
          console.log(JSON.stringify({ success: true, date, view, markdown, written: !!opts.write }, null, 2));
          return;
        }

        // --stdout is the default surface; print the rendered block.
        process.stdout.write(markdown);
        if (markdown === '' && !opts.write) {
          // Make the empty-day case visible on the error channel (stdout stays clean).
          info(`No staged meetings found for ${date}.`);
        }
        if (opts.write) {
          success(`Baseline written: ${baselinePath(paths.now, date)}`);
        }
      },
    );

  winddownCmd
    .command('apply <date>')
    .description('Apply a saved winddown approval doc (YYYY-MM-DD): diff vs baseline, confirm, execute')
    .option('--dry-run', 'Print the confirm summary + plan, execute nothing')
    .option('--yes', 'Skip the interactive confirm (assume y)')
    .option('--json', 'Output the plan + result as JSON')
    .action(async (date: string, opts: { dryRun?: boolean; yes?: boolean; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        else error('Not in an Areté workspace');
        process.exit(1);
      }

      const config = await loadConfig(services.storage, root);
      const paths = services.workspace.getPaths(root);
      const memoryDir = join(root, '.arete', 'memory', 'items');
      const meetingsDir = join(paths.resources, 'meetings');

      const editedPath = docPath(paths.now, date);
      const blPath = baselinePath(paths.now, date);

      const edited = await services.storage.read(editedPath);
      if (edited === null) {
        const msg = `Saved winddown doc not found: ${editedPath}`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
      }
      const baseline = await services.storage.read(blPath);
      if (baseline === null) {
        const msg =
          `Baseline not found: ${blPath}. The baseline is the COMPLETE curated doc, ` +
          `copied from winddown-${date}.md at the end of Step 5 ` +
          `(cp winddown-${date}.md winddown-${date}.baseline.md). Cannot diff without it.`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
      }

      const plan = buildApplyPlan(date, baseline, edited);

      // W4 B-3: anti-hand-author guard. If the EDITED doc resolves zero anchors
      // (the plan carries no items/choices/actions) BUT the baseline had ≥1
      // anchor, the doc was hand-authored or had its anchors stripped — apply
      // can't safely map it. Hard-refuse rather than silently no-op (which would
      // read as "applied, nothing to do"). The discriminator is computed
      // explicitly from the baseline because the plan object can't carry it.
      // False-positive-safe: unchecking everything keeps the `[ ]` anchor lines,
      // so the plan stays non-empty on normal edits. Both-empty (legitimate
      // empty day) falls through to a clean no-op.
      const editedAnchorCount =
        plan.items.length + plan.choices.length + plan.actions.length;
      const baselineAnchorCount = parseWinddownDoc(baseline).byAnchor.size;
      if (editedAnchorCount === 0 && baselineAnchorCount > 0) {
        const msg =
          `Edited winddown doc for ${date} resolves zero anchors, but the baseline ` +
          `has ${baselineAnchorCount}. The doc looks hand-authored or had its hidden ` +
          `anchors stripped — apply can't map it safely. Re-run \`arete winddown render\` ` +
          `and curate via frontmatter (staged_item_elevated / skip status), then re-apply. ` +
          `Nothing was changed.`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
      }

      const summary = renderApplySummary(plan);

      if (opts.dryRun) {
        if (opts.json) console.log(JSON.stringify({ success: true, dryRun: true, plan }, null, 2));
        else {
          info('DRY RUN — nothing executed.');
          console.log(summary);
        }
        return;
      }

      if (!opts.json) console.log(summary);

      // Confirm gate (D6).
      if (!opts.yes && !opts.json) {
        const { confirm } = await import('@inquirer/prompts');
        const proceed = await confirm({ message: 'Proceed?', default: false });
        if (!proceed) {
          info('Aborted — nothing executed.');
          process.exit(0);
        }
      }

      // ── Wire the apply primitives over real services ──
      const deps: WinddownApplyDeps = {
        async setItemStatus(slug, itemId, status, o) {
          const filePath = join(meetingsDir, `${slug}.md`);
          await writeItemStatusToFile(services.storage, filePath, itemId, {
            status,
            editedText: o?.editedText,
          });
          // user-rejected skip reason → structural marker honored by commit.
          if (status === 'skipped' && o?.skipReason) {
            await writeSkipReason(services.storage, filePath, itemId, o.skipReason);
          }
        },
        async commitMeeting(slug) {
          const filePath = join(meetingsDir, `${slug}.md`);
          const content = await services.storage.read(filePath);
          if (content === null) return 'already-applied';
          // Idempotency (genuine pre-applied guard): a meeting whose frontmatter
          // is ALREADY `status: approved` was committed on a prior run — no-op.
          const fm = content.match(/^---\n([\s\S]*?)\n---/);
          if (fm && /\bstatus:\s*approved\b/.test(fm[1])) return 'already-applied';
          // Distinguish "nothing to do" from "all items skipped this run". A run
          // where the user unchecked every approved item still has staged
          // statuses (all `skipped`) and MUST be committed: `commitApprovedItems`
          // advances `status` → `approved`, strips the staged sections, and
          // writes `## Skipped on Apply` even with zero approved items. Only a
          // meeting with NO staged statuses at all is a true no-op.
          const statusMap = parseStagedItemStatus(content);
          if (Object.keys(statusMap).length === 0) return 'already-applied';
          await commitApprovedItems(services.storage, filePath, memoryDir);
          return 'committed';
        },
        async resolveCommitment(id) {
          // R7 guard: only open commitments are resolvable; an id absent from
          // the open list is already resolved (or gone) → no mutation.
          const open = await services.commitments.listOpen();
          const match = open.find((c) => c.id === id || c.id.startsWith(id));
          if (!match) return 'already-resolved';
          await services.commitments.resolve(match.id, 'resolved');
          return 'resolved';
        },
        // `act:create:*` is intentionally NOT wired here: creating a commitment
        // needs person/direction resolution (chef-orchestrated, not derivable
        // from the doc deterministically). With `createCommitment` absent, the
        // engine routes `create` actions through `draftAction` below so the
        // chef executes the `commitments_create` verb via MCP.
        async draftAction(verb, id, body) {
          // Do NOT send — emit the draft/command for the chef to execute via MCP.
          // The EDITED body flows through verbatim (D8 / AC5b).
          const payload = body !== undefined ? `\n${body}` : '';
          info(`DRAFT ${verb}:${id}${payload}`);
        },
      };

      const result = await executeWinddownApply(plan, deps);

      if (opts.json) {
        console.log(JSON.stringify({ success: true, plan, result }, null, 2));
        return;
      }

      success(`Applied winddown ${date}.`);
      info(
        `${result.approvedItems} approved · ${result.skippedItems} skipped · ` +
          `${result.meetingsCommitted.length} meetings committed · ` +
          `${result.resolvedCommitments.length} resolved` +
          (result.alreadyResolved.length > 0 ? ` (${result.alreadyResolved.length} already resolved)` : '') +
          ` · ${result.draftedActions} drafts queued`,
      );
      if (result.warnings.length > 0) {
        info('Warnings (surfaced, NOT applied):');
        for (const w of result.warnings) info(`  - ${w}`);
      }

      // Re-index after writes.
      if (!opts.json && result.meetingsCommitted.length > 0) {
        info('Run `arete index` to re-index after applying.');
      }
    });

  // ── elevate <meeting> <itemId...> ──────────────────────────────────────────
  // CHR-W4 FF-1: deterministic surface over `writeItemElevatedToFile` /
  // `removeItemElevatedFromFile`. Replaces the chef's hand-edit of
  // `staged_item_elevated` in SKILL Step 2d (typo/format footgun). Writes
  // `staged_item_elevated[id] = true` per id (or deletes with --remove).
  // CRITICALLY never touches `staged_item_status` (the B-2 invariant): elevation
  // is a render-only pre-check, never commit-readiness.
  winddownCmd
    .command('elevate <meeting> <itemId...>')
    .description(
      'Mark staged items as confident-keep on a meeting (pre-checks `[x]` in the ' +
        'render). <meeting> is a slug or path under resources/meetings/. Writes ' +
        'staged_item_elevated[id]=true via the core helper; NEVER touches ' +
        'staged_item_status. --remove un-elevates.',
    )
    .option('--remove', 'Delete the named ids from the elevated map (un-elevate / correct)')
    .option('--json', 'Emit { success, meeting, elevated, removed } as JSON')
    .action(async (meeting: string, itemIds: string[], opts: { remove?: boolean; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        else error('Not in an Areté workspace');
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const meetingsDir = join(paths.resources, 'meetings');

      // Resolve <meeting> as a slug OR a path, the way the meeting CLI commands
      // do: a bare slug → resources/meetings/<slug>.md; an absolute path is used
      // as-is; a relative path is resolved against the workspace root.
      let filePath: string;
      if (isAbsolute(meeting)) {
        filePath = meeting;
      } else if (meeting.includes('/') || meeting.endsWith('.md')) {
        filePath = join(root, meeting);
      } else {
        filePath = join(meetingsDir, `${meeting}.md`);
      }

      const content = await services.storage.read(filePath);
      if (content === null) {
        const msg = `Meeting not found: ${meeting}`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
        return;
      }

      // Validate every id exists in the meeting's staged sections BEFORE any
      // mutation — unknown id → error + non-zero exit + zero mutation (AC-FF1.5).
      const sections = parseStagedSections(content);
      const knownIds = new Set([
        ...sections.actionItems.map((i) => i.id),
        ...sections.decisions.map((i) => i.id),
        ...sections.learnings.map((i) => i.id),
      ]);
      // --remove with an absent id is a no-op (AC-FF1.2), not an error: the
      // caller's contract ("ensure not elevated") already holds. Only the
      // SET path requires the id to exist as a staged item.
      if (!opts.remove) {
        const unknown = itemIds.filter((id) => !knownIds.has(id));
        if (unknown.length > 0) {
          const msg = `Unknown staged item id(s) on ${meeting}: ${unknown.join(', ')}`;
          if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
          else error(msg);
          process.exit(1);
          return;
        }
      }

      if (opts.remove) {
        for (const id of itemIds) {
          await removeItemElevatedFromFile(services.storage, filePath, id);
        }
      } else {
        for (const id of itemIds) {
          await writeItemElevatedToFile(services.storage, filePath, id);
        }
      }

      const slug = basename(filePath, '.md');
      if (opts.json) {
        console.log(
          JSON.stringify({
            success: true,
            meeting: slug,
            elevated: opts.remove ? [] : itemIds,
            removed: opts.remove ? itemIds : [],
          }),
        );
        return;
      }
      if (opts.remove) success(`Un-elevated ${itemIds.length} item(s) on ${slug}: ${itemIds.join(', ')}`);
      else success(`Elevated ${itemIds.length} item(s) on ${slug}: ${itemIds.join(', ')}`);
    });
}

/**
 * Write a user-set skip reason marker so `commitApprovedItems` records it in
 * the audit trail. Read-parse-update-write, preserving other frontmatter.
 */
async function writeSkipReason(
  storage: { read: (p: string) => Promise<string | null>; write: (p: string, c: string) => Promise<void> },
  filePath: string,
  itemId: string,
  reason: string,
): Promise<void> {
  const raw = await storage.read(filePath);
  if (raw === null) return;
  const { parse, stringify } = await import('yaml');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return;
  const data = (parse(match[1]) as Record<string, unknown>) ?? {};
  const body = match[2];
  const map = (data['staged_item_skip_reason'] as Record<string, unknown> | undefined) ?? {};
  map[itemId] = {
    reason,
    evidence: 'winddown apply: user unchecked an agent-recommended keep',
    setBy: 'user',
    setAt: new Date().toISOString(),
  };
  data['staged_item_skip_reason'] = map;
  const fm = stringify(data).trimEnd();
  await storage.write(filePath, `---\n${fm}\n---\n\n${body.replace(/^\n+/, '')}`);
}
