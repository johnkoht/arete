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
import { join } from 'node:path';
import { createServices, loadConfig, buildApplyPlan, renderApplySummary, executeWinddownApply, writeItemStatusToFile, commitApprovedItems, parseStagedItemStatus, } from '@arete/core';
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
export function registerWinddownCommand(program) {
    const winddownCmd = program
        .command('winddown')
        .description('Winddown approval-doc apply (checkbox review surface)');
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
            const msg = `Baseline not found: ${blPath}. The baseline is written at render time ` +
                `(winddown_render: checklist). Cannot diff without it.`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        const plan = buildApplyPlan(date, baseline, edited);
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
                // Idempotency: an already-approved meeting is a no-op.
                const fm = content.match(/^---\n([\s\S]*?)\n---/);
                if (fm && /\bstatus:\s*approved\b/.test(fm[1]))
                    return 'already-applied';
                // Nothing approved → nothing to commit (e.g. all skipped).
                const statusMap = parseStagedItemStatus(content);
                const hasApproved = Object.values(statusMap).some((s) => s === 'approved');
                if (!hasApproved)
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