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
import { join, basename } from 'node:path';
import { createServices, loadConfig, buildApplyPlan, parseWinddownDoc, renderApplySummary, executeWinddownApply, writeItemStatusToFile, commitApprovedItems, parseStagedItemStatus, buildChecklistMeeting, renderStagedBlock, renderWinddownDoc, } from '@arete/core';
import { error, info, success } from '../formatters.js';
function archiveDir(now) {
    return join(now, 'archive', 'daily-winddown');
}
/** Persist the agent-rendered baseline alongside the archive (called at render time). */
export function baselinePath(now, date) {
    return join(archiveDir(now), `winddown-${date}.baseline.md`);
}
export function docPath(now, date) {
    return join(archiveDir(now), `winddown-${date}.md`);
}
/** Weekday label (e.g. "Tue") for a YYYY-MM-DD date, locally. */
function weekdayLabel(date) {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return undefined;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime()))
        return undefined;
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}
/** Title from a meeting file's frontmatter, falling back to the slug. */
function titleFromContent(content, slug) {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
        const t = fm[1].match(/^title:\s*(.+)$/m);
        if (t)
            return t[1].trim().replace(/^["']|["']$/g, '');
    }
    return slug;
}
/** `status:` value from a meeting file's frontmatter, or null. */
function statusFromContent(content) {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm)
        return null;
    const s = fm[1].match(/^status:\s*(\S+)/m);
    return s ? s[1] : null;
}
export function registerWinddownCommand(program) {
    const winddownCmd = program
        .command('winddown')
        .description('Winddown approval-doc render + apply (checkbox review surface)');
    winddownCmd
        .command('render <date>')
        .description('Render the deterministic staged-items/decisions/learnings checkbox block ' +
        'for a day (YYYY-MM-DD) from meeting frontmatter. The agent splices this ' +
        'into the curated view as `## Stage for approval`. Use --stdout (default); ' +
        'the apply baseline is the COMPLETE composed doc (cp it in Step 5), NOT the ' +
        'staged block alone — see --write.')
        .option('--stdout', 'Print the rendered block to stdout (default)')
        .option('--write', 'DEPRECATED as a baseline source: writes ONLY the staged block to ' +
        'winddown-<date>.baseline.md — it omits the hand-composed ## Proposed ' +
        'actions, so apply silently drops them. The baseline must be the COMPLETE ' +
        'doc; cp winddown-<date>.md in Step 5 instead.')
        .option('--json', 'Emit { view, markdown } as JSON')
        .option('--view <file>', 'Render a FULL ChecklistView (with agent-composed choices + proposed actions) ' +
        'from a JSON file instead of the frontmatter-only staged block')
        .action(async (date, opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            else
                error('Not in an Areté workspace');
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        const meetingsDir = join(paths.resources, 'meetings');
        let markdown;
        let view;
        if (opts.view) {
            // FULL view path: the agent hands in choices + proposed actions.
            const viewRaw = await services.storage.read(opts.view.startsWith('/') ? opts.view : join(root, opts.view));
            if (viewRaw === null) {
                const msg = `View file not found: ${opts.view}`;
                if (opts.json)
                    console.log(JSON.stringify({ success: false, error: msg }));
                else
                    error(msg);
                process.exit(1);
            }
            view = JSON.parse(viewRaw);
            markdown = renderWinddownDoc(view);
        }
        else {
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
            const meetings = [];
            for (const filePath of dayFiles) {
                const content = await services.storage.read(filePath);
                if (content === null)
                    continue;
                const status = statusFromContent(content);
                if (status !== 'processed' && status !== 'approved')
                    continue;
                const slug = basename(filePath, '.md');
                const title = titleFromContent(content, slug);
                const cm = buildChecklistMeeting(content, { slug, title });
                // Only include meetings that actually have staged items.
                const hasItems = cm.sections.actionItems.length +
                    cm.sections.decisions.length +
                    cm.sections.learnings.length >
                    0;
                if (hasItems)
                    meetings.push(cm);
            }
            view = {
                date,
                weekday: weekdayLabel(date),
                meetings,
                choices: [],
                actions: [],
            };
            markdown = renderStagedBlock(meetings);
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
    });
    winddownCmd
        .command('apply <date>')
        .description('Apply a saved winddown approval doc (YYYY-MM-DD): diff vs baseline, confirm, execute')
        .option('--dry-run', 'Print the confirm summary + plan, execute nothing')
        .option('--yes', 'Skip the interactive confirm (assume y)')
        .option('--json', 'Output the plan + result as JSON')
        .action(async (date, opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            else
                error('Not in an Areté workspace');
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
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        const baseline = await services.storage.read(blPath);
        if (baseline === null) {
            const msg = `Baseline not found: ${blPath}. The baseline is the COMPLETE curated doc, ` +
                `copied from winddown-${date}.md at the end of Step 5 ` +
                `(cp winddown-${date}.md winddown-${date}.baseline.md). Cannot diff without it.`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
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
        const editedAnchorCount = plan.items.length + plan.choices.length + plan.actions.length;
        const baselineAnchorCount = parseWinddownDoc(baseline).byAnchor.size;
        if (editedAnchorCount === 0 && baselineAnchorCount > 0) {
            const msg = `Edited winddown doc for ${date} resolves zero anchors, but the baseline ` +
                `has ${baselineAnchorCount}. The doc looks hand-authored or had its hidden ` +
                `anchors stripped — apply can't map it safely. Re-run \`arete winddown render\` ` +
                `and curate via frontmatter (staged_item_elevated / skip status), then re-apply. ` +
                `Nothing was changed.`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        const summary = renderApplySummary(plan);
        if (opts.dryRun) {
            if (opts.json)
                console.log(JSON.stringify({ success: true, dryRun: true, plan }, null, 2));
            else {
                info('DRY RUN — nothing executed.');
                console.log(summary);
            }
            return;
        }
        if (!opts.json)
            console.log(summary);
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
        const deps = {
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
                if (content === null)
                    return 'already-applied';
                // Idempotency (genuine pre-applied guard): a meeting whose frontmatter
                // is ALREADY `status: approved` was committed on a prior run — no-op.
                const fm = content.match(/^---\n([\s\S]*?)\n---/);
                if (fm && /\bstatus:\s*approved\b/.test(fm[1]))
                    return 'already-applied';
                // Distinguish "nothing to do" from "all items skipped this run". A run
                // where the user unchecked every approved item still has staged
                // statuses (all `skipped`) and MUST be committed: `commitApprovedItems`
                // advances `status` → `approved`, strips the staged sections, and
                // writes `## Skipped on Apply` even with zero approved items. Only a
                // meeting with NO staged statuses at all is a true no-op.
                const statusMap = parseStagedItemStatus(content);
                if (Object.keys(statusMap).length === 0)
                    return 'already-applied';
                await commitApprovedItems(services.storage, filePath, memoryDir);
                return 'committed';
            },
            async resolveCommitment(id) {
                // R7 guard: only open commitments are resolvable; an id absent from
                // the open list is already resolved (or gone) → no mutation.
                const open = await services.commitments.listOpen();
                const match = open.find((c) => c.id === id || c.id.startsWith(id));
                if (!match)
                    return 'already-resolved';
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
        info(`${result.approvedItems} approved · ${result.skippedItems} skipped · ` +
            `${result.meetingsCommitted.length} meetings committed · ` +
            `${result.resolvedCommitments.length} resolved` +
            (result.alreadyResolved.length > 0 ? ` (${result.alreadyResolved.length} already resolved)` : '') +
            ` · ${result.draftedActions} drafts queued`);
        if (result.warnings.length > 0) {
            info('Warnings (surfaced, NOT applied):');
            for (const w of result.warnings)
                info(`  - ${w}`);
        }
        // Re-index after writes.
        if (!opts.json && result.meetingsCommitted.length > 0) {
            info('Run `arete index` to re-index after applying.');
        }
    });
}
/**
 * Write a user-set skip reason marker so `commitApprovedItems` records it in
 * the audit trail. Read-parse-update-write, preserving other frontmatter.
 */
async function writeSkipReason(storage, filePath, itemId, reason) {
    const raw = await storage.read(filePath);
    if (raw === null)
        return;
    const { parse, stringify } = await import('yaml');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return;
    const data = parse(match[1]) ?? {};
    const body = match[2];
    const map = data['staged_item_skip_reason'] ?? {};
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
//# sourceMappingURL=winddown.js.map