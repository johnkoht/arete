/**
 * `arete dedup` — Phase 10e background dedup hygiene verb.
 *
 * Manual-only (no cron in v2). Reuses the shipped reactive pipeline
 * (Phase 10b-min) to dedup retroactively against existing data within
 * an optional `--since` window.
 *
 * Modes:
 *   - `--dry-run` (default): writes diff report to dev/work/plans/.../
 *     dedup-diff-<scope>-<date>.md and DOES NOT modify any data.
 *   - `--apply`: requires explicit flag. Wraps the read-modify-write
 *     cycle in `services.commitments.withLock(...)` (commitments scope)
 *     so concurrent `arete meeting extract` cannot race. For memory
 *     scopes (decisions / learnings / topics), v2 surfaces a diff for
 *     editorial review — auto-merge is a non-goal per plan v2 §AC10a.
 *
 * Critical invariants:
 *   - NO production data writes during `--dry-run`.
 *   - NO LLM calls without an `--llm` flag (engine accepts callConcurrent
 *     as an option). When `--llm` is set, AIService.callConcurrent is
 *     wired in at the `fast` tier (matches reactive default).
 *   - Mutual exclusion with reactive dedup via withLock (commitments
 *     scope). If meeting extract is running, `dedup --apply` waits or
 *     aborts via the same lockfile.
 */
import { join, isAbsolute, resolve as resolvePath } from 'node:path';
import { createServices, parseCommitmentsFile, serializeCommitmentsFile, parseMemorySections, runBackgroundDedup, applyCommitmentsDedup, collectDupeProvenance, appendDedupDecisionLog, parseDedupLog, lookupCommitmentById, formatExplainReport, } from '@arete/core';
import { listItem, error, info, success } from '../formatters.js';
const VALID_SCOPES = [
    'commitments',
    'decisions',
    'learnings',
    'topics',
];
export function registerDedupCommand(program) {
    program
        .command('dedup')
        .description('Background dedup hygiene pass. Reuses the reactive hybrid pipeline retroactively across an --since window. Default is --dry-run (writes diff report only); --apply mutates commitments.json under lock.')
        .option('--scope <scope>', `Scope: ${VALID_SCOPES.join(' | ')} (required unless --explain is used)`)
        .option('--explain <commitment-id>', 'Print dedup provenance for a single commitment (8-char prefix or full hash): canonical text, stakeholders, source meetings with merge events, textVariants, and dedup-decisions log entries. Read-only.')
        .option('--dry-run', 'Default — produce diff report without writing any data')
        .option('--apply', 'Write the merge result (commitments scope only in v2). Acquires the commitments lock before reading + writing.')
        .option('--since <YYYY-MM-DD>', 'Limit scope to entries from this date forward (default: all-time)')
        .option('--llm', 'Invoke the AIService LLM for ambiguous-pair cross-check (default: deterministic Jaccard-only, surfaces fuzzy pairs as candidates without LLM verdicts)')
        .option('--tier <tier>', 'LLM tier: fast | standard | frontier (default: fast)', 'fast')
        .option('--diff-dir <path>', 'Directory for the diff report (default: dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator)')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        // ----- Explain mode (Phase 10b-aux, AC7) -----
        // Branches BEFORE scope validation: --explain does not take a scope.
        if (opts.explain) {
            await runExplain(opts.explain, Boolean(opts.json));
            return;
        }
        // Scope is required for all non-explain modes.
        if (!opts.scope) {
            const msg = 'Missing required option: --scope (or use --explain <commitment-id>)';
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Validate scope.
        if (!VALID_SCOPES.includes(opts.scope)) {
            const msg = `Invalid --scope: "${opts.scope}". Must be one of: ${VALID_SCOPES.join(', ')}`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        const scope = opts.scope;
        // Validate tier.
        const tier = (opts.tier ?? 'fast');
        if (!['fast', 'standard', 'frontier'].includes(tier)) {
            const msg = `Invalid --tier: "${opts.tier}". Must be one of: fast, standard, frontier`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Validate --since shape (YYYY-MM-DD).
        if (opts.since && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
            const msg = `Invalid --since: "${opts.since}". Must be YYYY-MM-DD.`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Resolve workspace root.
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            const msg = 'Not in an Areté workspace';
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else {
                error(msg);
                info('Run "arete install" to create a workspace');
            }
            process.exit(1);
        }
        // Default mode: dry-run unless --apply explicitly set.
        const mode = opts.apply ? 'apply' : 'dry-run';
        // Optional LLM wiring.
        const callConcurrent = opts.llm
            ? (async (prompts) => services.ai.callConcurrent(prompts))
            : undefined;
        // Build inputs based on scope.
        let result;
        try {
            const inputs = await loadInputsForScope(scope, services, root, {
                since: opts.since,
                dryRun: mode === 'dry-run',
                callConcurrent,
                tier,
            });
            result = await runBackgroundDedup(inputs);
        }
        catch (err) {
            const msg = `Failed to run dedup: ${err instanceof Error ? err.message : String(err)}`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Write the diff report.
        const ts = new Date().toISOString();
        const dateStamp = ts.slice(0, 10); // YYYY-MM-DD
        const diffDir = opts.diffDir
            ? isAbsolute(opts.diffDir)
                ? resolvePath(opts.diffDir)
                : resolvePath(root, opts.diffDir)
            : join(root, 'dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator');
        const diffPath = join(diffDir, `dedup-diff-${scope}-${dateStamp}.md`);
        try {
            await services.storage.write(diffPath, result.diff);
        }
        catch (err) {
            const msg = `Failed to write dedup diff: ${err instanceof Error ? err.message : String(err)}`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        // Dry-run path: stop here.
        if (mode === 'dry-run') {
            renderSuccess({
                json: opts.json,
                mode,
                scope,
                summary: result.summary,
                diffPath,
                applied: false,
                since: opts.since,
            });
            return;
        }
        // ----- Apply path -----
        if (scope !== 'commitments') {
            // Per plan AC10a: memory scopes are surface-only in v2. Diff
            // written above is the user-facing artifact; we do not auto-
            // merge sections.
            if (!opts.json) {
                info(`--apply for scope=${scope} is surface-only in v2 (per plan AC10a). Diff written; no data mutated. Manual merge guidance lives in the diff report.`);
            }
            renderSuccess({
                json: opts.json,
                mode,
                scope,
                summary: result.summary,
                diffPath,
                applied: false,
                since: opts.since,
            });
            return;
        }
        // Commitments-scope apply: re-run under withLock for atomicity.
        const commitmentsPath = join(root, '.arete/commitments.json');
        try {
            await services.commitments.withLock(async () => {
                // Re-read under the lock for the authoritative input.
                const lockedRaw = await services.storage.read(commitmentsPath);
                const lockedCommitments = parseCommitmentsFile(lockedRaw);
                // Re-run engine against locked content (mutual exclusion with
                // reactive dedup running in `arete meeting extract`).
                const lockedResult = await runBackgroundDedup({
                    scope: 'commitments',
                    dryRun: false,
                    since: opts.since,
                    commitments: lockedCommitments,
                    callConcurrent,
                    tier,
                });
                // Apply pure transformer.
                const next = applyCommitmentsDedup(lockedCommitments, lockedResult);
                // Atomic write via tmp + rename (storage adapter handles).
                const json = serializeCommitmentsFile(next);
                await services.storage.write(commitmentsPath, json);
                // I-6: persist the dupe→source provenance for each absorbed dupe
                // to the dedup-decisions log. `applyCommitmentsDedup` unions and
                // then discards the per-dupe {dupeId, sourceMeeting, text}; we
                // capture it from the same locked inputs and append it as MERGE
                // log lines so a future `[[unmerge]]` of a 3+-source canonical can
                // reconstruct the correct split (via buildDupeSourceMapping).
                // Best-effort: log-write failures never block the apply. NOTE:
                // this is the durable RECORD only — I-6 fully closes once the
                // unmerge wire-in consumes this mapping (currently unbuilt).
                for (const payload of collectDupeProvenance(lockedCommitments, lockedResult)) {
                    await appendDedupDecisionLog(root, payload);
                }
                // Mutate `result` so output reflects what was written.
                result = lockedResult;
            });
        }
        catch (err) {
            const msg = `Failed to apply commitments dedup: ${err instanceof Error ? err.message : String(err)}`;
            if (opts.json)
                console.log(JSON.stringify({ success: false, error: msg }));
            else
                error(msg);
            process.exit(1);
        }
        renderSuccess({
            json: opts.json,
            mode,
            scope,
            summary: result.summary,
            diffPath,
            applied: true,
            since: opts.since,
        });
    });
}
// ---------------------------------------------------------------------------
// Explain mode (Phase 10b-aux, AC7)
// ---------------------------------------------------------------------------
/**
 * `arete dedup --explain <id>` — print provenance for one commitment.
 *
 * Read-only: loads commitments.json + dev/diary/dedup-decisions.log, resolves
 * the commitment by full hash or short prefix, and renders the AC7 report.
 * The log is best-effort observability (missing log → report still prints,
 * with a "(no log entries)" note).
 */
async function runExplain(idOrPrefix, json) {
    const services = await createServices(process.cwd());
    const root = await services.workspace.findRoot();
    if (!root) {
        const msg = 'Not in an Areté workspace';
        if (json)
            console.log(JSON.stringify({ success: false, error: msg }));
        else {
            error(msg);
            info('Run "arete install" to create a workspace');
        }
        process.exit(1);
    }
    // Load commitments.json.
    const commitmentsPath = join(root, '.arete/commitments.json');
    const rawCommitments = await services.storage.read(commitmentsPath);
    if (rawCommitments === null) {
        const msg = `No commitments.json found at ${commitmentsPath}`;
        if (json)
            console.log(JSON.stringify({ success: false, error: msg }));
        else
            error(msg);
        process.exit(1);
    }
    const commitments = parseCommitmentsFile(rawCommitments);
    // Resolve the commitment.
    const lookup = lookupCommitmentById(commitments, idOrPrefix);
    if (lookup.kind === 'not-found') {
        const msg = `No commitment matches "${idOrPrefix}" (full hash or hash prefix).`;
        if (json)
            console.log(JSON.stringify({ success: false, error: msg }));
        else
            error(msg);
        process.exit(1);
    }
    if (lookup.kind === 'ambiguous') {
        const ids = lookup.matches.map((c) => c.id.slice(0, 12));
        const msg = `Prefix "${idOrPrefix}" matches ${lookup.matches.length} commitments: ${ids.join(', ')}… — use a longer prefix.`;
        if (json) {
            console.log(JSON.stringify({ success: false, error: msg, matches: ids }));
        }
        else
            error(msg);
        process.exit(1);
    }
    // Load + parse the decisions log (best-effort — absence is fine).
    const logPath = join(root, 'dev', 'diary', 'dedup-decisions.log');
    let logEntries = parseDedupLog('');
    try {
        const rawLog = await services.storage.read(logPath);
        if (rawLog !== null)
            logEntries = parseDedupLog(rawLog);
    }
    catch {
        // Best-effort: log read failure → empty provenance overlay.
    }
    const report = formatExplainReport(lookup.commitment, logEntries);
    if (json) {
        console.log(JSON.stringify({
            success: true,
            id: lookup.commitment.id,
            report,
        }, null, 2));
    }
    else {
        console.log(report);
    }
}
// ---------------------------------------------------------------------------
// Inputs loader per scope
// ---------------------------------------------------------------------------
async function loadInputsForScope(scope, services, root, opts) {
    switch (scope) {
        case 'commitments': {
            const commitmentsPath = join(root, '.arete/commitments.json');
            const raw = await services.storage.read(commitmentsPath);
            const commitments = parseCommitmentsFile(raw);
            return {
                scope,
                since: opts.since,
                dryRun: opts.dryRun,
                commitments,
                callConcurrent: opts.callConcurrent,
                tier: opts.tier,
            };
        }
        case 'decisions':
        case 'learnings': {
            const fileName = `${scope}.md`;
            const paths = services.workspace.getPaths(root);
            const filePath = join(paths.memory, 'items', fileName);
            const raw = await services.storage.read(filePath);
            const sections = [];
            if (raw !== null) {
                const parsed = parseMemorySections(raw);
                for (const s of parsed) {
                    const sec = {
                        title: s.title,
                        body: s.body,
                    };
                    if (s.date)
                        sec.date = s.date;
                    if (s.source)
                        sec.source = s.source;
                    if (s.topics)
                        sec.topics = s.topics;
                    sections.push(sec);
                }
            }
            return {
                scope,
                since: opts.since,
                dryRun: opts.dryRun,
                sections,
                callConcurrent: opts.callConcurrent,
                tier: opts.tier,
            };
        }
        case 'topics': {
            const paths = services.workspace.getPaths(root);
            const { topics: pages } = await services.topicMemory.listAll(paths);
            const topics = pages.map((p) => {
                const body = Object.values(p.sections)
                    .filter((s) => typeof s === 'string')
                    .join('\n\n');
                const t = {
                    topicSlug: p.frontmatter.topic_slug,
                    aliases: p.frontmatter.aliases ?? [],
                    body,
                };
                if (p.frontmatter.last_refreshed) {
                    t.lastRefreshed = p.frontmatter.last_refreshed;
                }
                return t;
            });
            return {
                scope,
                since: opts.since,
                dryRun: opts.dryRun,
                topics,
                callConcurrent: opts.callConcurrent,
                tier: opts.tier,
            };
        }
        default: {
            const _exhaustive = scope;
            throw new Error(`Unknown scope: ${_exhaustive}`);
        }
    }
}
// ---------------------------------------------------------------------------
// Success rendering
// ---------------------------------------------------------------------------
function renderSuccess(args) {
    if (args.json) {
        console.log(JSON.stringify({
            success: true,
            mode: args.mode,
            scope: args.scope,
            summary: args.summary,
            diffPath: args.diffPath,
            applied: args.applied,
            ...(args.since ? { since: args.since } : {}),
        }, null, 2));
        return;
    }
    if (args.applied) {
        success(`Applied ${args.scope} dedup: ${args.summary.duplicates} duplicate(s) absorbed across ${args.summary.groups} group(s).`);
    }
    else {
        success(`${args.mode === 'dry-run' ? 'Dry-run' : 'Apply (surface-only)'} complete for scope=${args.scope}: ${args.summary.totalIn} items in scope, ${args.summary.groups} group(s), ${args.summary.uncertain} pair(s) for review.`);
    }
    listItem('Diff report', args.diffPath);
    listItem('Summary', `totalIn=${args.summary.totalIn} groups=${args.summary.groups} duplicates=${args.summary.duplicates} uncertain=${args.summary.uncertain}`);
    if (args.mode === 'dry-run') {
        console.log('');
        info(`To apply (commitments scope only in v2): rerun with --apply. Memory scopes are surface-only; edit the source files using the diff as guidance.`);
    }
    console.log('');
}
//# sourceMappingURL=dedup.js.map