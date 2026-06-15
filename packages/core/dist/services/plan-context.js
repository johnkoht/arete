/**
 * Plan-context aggregator (WS-2 / WS-3 — plan-context-injection).
 *
 * `arete plan-context --week|--day` composes the EXISTING project/topic/wiki
 * assemblers into one pre-seeded, `[source]`-tagged bundle for the planning
 * surfaces (week-plan, daily-plan). It does NOT duplicate assembly:
 *
 *   - project bodies come ONLY through `selectProjectDocs` (the WS-1 engine);
 *   - active-project metadata via `listActiveProjects`;
 *   - "what changed" via `assembleProjectWhatsNew`;
 *   - active topics via `getActiveTopics`;
 *   - last week's plan by reading `now/week.md`.
 *
 * NO LLM / embeddings — selection is lexical (jaccard + mtime) inside
 * `selectProjectDocs`; everything here is composition + budgeting + tagging.
 *
 * The CLI command (`packages/cli/src/commands/plan-context.ts`) is a thin
 * shell over `assemblePlanContext` — it performs ZERO body parsing
 * (pre-mortem R6): no `parseFrontmatter` on project READMEs, no `## ` heading
 * regex of its own, no `readFileSync` of project docs. All of that lives here,
 * composing the engines above. `openQuestions[]` (R7) is derived by extracting
 * the `/open questions/i` heading SECTION from the `expanded[]` docs that
 * `selectProjectDocs` already returns — never by re-reading files.
 */
import { join } from 'path';
import { loadAreaAliasMap } from './area-parser.js';
import { getActiveTopics } from '../models/active-topics.js';
import { listActiveProjects, selectProjectDocs, assembleProjectWhatsNew, loadMeetingIndex, } from './brief-assemblers.js';
/**
 * Default expanded-body budget (chars) shared across the top projects in a
 * plan-context bundle. Tighter than the generic `/project` read
 * (`PROJECT_DOC_BUDGET_DEFAULT` = 12k) because a plan bundle stacks many
 * projects + topics + goals into one agent turn.
 */
export const PLAN_CONTEXT_PROJECT_DOC_BUDGET = 8_000;
/** Max projects expanded per bundle (recency/area-ranked). Rest are summarized. */
export const PLAN_CONTEXT_MAX_PROJECTS = 6;
/** "Recently active" window (days) for the --day fallback (pre-mortem R13). */
export const PLAN_CONTEXT_RECENT_DAYS = 7;
/** Cap on extracted open-question bullets per project. */
const OPEN_QUESTIONS_CAP = 6;
/**
 * Extract the body of the first section whose heading matches `/open
 * questions/i`, split into non-empty bullet/line items (R7). Operates on a doc
 * BODY already returned by `selectProjectDocs.expanded[]` — composes selection
 * output, never re-reads files. Returns [] when no such section exists.
 */
export function extractOpenQuestions(body) {
    const lines = body.split('\n');
    const items = [];
    let inSection = false;
    let sectionDepth = 0;
    for (const raw of lines) {
        const heading = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (heading) {
            const depth = heading[1].length;
            const text = heading[2].trim();
            if (!inSection) {
                if (/open questions/i.test(text)) {
                    inSection = true;
                    sectionDepth = depth;
                }
                continue;
            }
            // A heading at the same-or-shallower depth ends the section.
            if (depth <= sectionDepth)
                break;
            continue; // deeper sub-heading inside the section — skip the heading line
        }
        if (!inSection)
            continue;
        const line = raw.trim();
        if (line.length === 0)
            continue;
        if (line.startsWith('<!--'))
            continue;
        // Strip a leading list marker / checkbox so the bullet text is clean.
        const cleaned = line
            .replace(/^[-*+]\s+/, '')
            .replace(/^\d+\.\s+/, '')
            .replace(/^\[[ xX]\]\s+/, '')
            .trim();
        if (cleaned.length === 0)
            continue;
        items.push(cleaned);
        if (items.length >= OPEN_QUESTIONS_CAP)
            break;
    }
    return items;
}
/** Map a ProjectDocSelection into the tagged, flattened bundle doc list. */
function toSelectedDocs(slug, sel) {
    const docs = [];
    for (const d of sel.expanded) {
        docs.push({
            slug,
            rel: d.rel,
            heading: d.heading,
            score: d.score,
            provenance: d.provenance,
            listed: false,
        });
    }
    for (const l of sel.listed) {
        docs.push({
            slug,
            rel: l.rel,
            heading: l.firstHeading ?? l.title,
            score: 0,
            provenance: l.provenance,
            listed: true,
        });
    }
    return docs;
}
/** Compact the verbose ProjectWhatsNew into counts the planner can scan. */
function toWhatsNew(wn) {
    if (!wn)
        return null;
    return {
        since: wn.since ?? null,
        meetings: wn.meetings.length,
        commitments: wn.commitments.length,
        topics: wn.topics.length,
    };
}
/** List today's distinct areas from the meeting index (pure read, NO network). */
export async function resolveTodayAreas(deps, paths, referenceDate = new Date()) {
    const aliasMap = await loadAreaAliasMap(deps.storage, paths.root);
    const index = await loadMeetingIndex(deps.storage, paths, aliasMap);
    const today = referenceDate.toISOString().slice(0, 10);
    const areas = new Set();
    for (const m of index) {
        if (m.date === today && m.area)
            areas.add(m.area);
    }
    return [...areas].sort();
}
/**
 * Assemble the plan-context bundle for `--week` or `--day`. Pure read,
 * NO LLM. Composes WS-1 `selectProjectDocs` + existing assemblers.
 */
export async function assemblePlanContext(mode, paths, deps, opts = {}) {
    const referenceDate = opts.referenceDate ?? new Date();
    const budgetChars = opts.budgetChars ?? PLAN_CONTEXT_PROJECT_DOC_BUDGET;
    const maxProjects = opts.maxProjects ?? PLAN_CONTEXT_MAX_PROJECTS;
    const aliasMap = await loadAreaAliasMap(deps.storage, paths.root);
    // ---- 1. Candidate projects -------------------------------------------
    const allProjects = await listActiveProjects(deps.storage, paths, aliasMap);
    let candidates = allProjects;
    let reason;
    if (mode === 'project') {
        // Single-project read (the `arete plan-context --project <slug>` escape
        // hatch + AGENTS.md current-state source). Filter to the named slug.
        candidates = allProjects.filter((p) => p.slug === opts.projectSlug);
    }
    else if (mode === 'day') {
        const todayAreas = opts.todayAreas ?? (await resolveTodayAreas(deps, paths, referenceDate));
        const areaSet = new Set(todayAreas);
        const scoped = allProjects.filter((p) => p.area && areaSet.has(p.area));
        if (scoped.length > 0) {
            candidates = scoped;
        }
        else {
            // R13: never a silent empty bundle. Fall back to recently-active projects
            // (README touched within the window); else flag the empty reason.
            const recent = [];
            for (const p of allProjects) {
                const mod = await deps.storage.getModified(p.readmePath);
                if (!mod)
                    continue;
                const ageDays = (referenceDate.getTime() - mod.getTime()) / (1000 * 60 * 60 * 24);
                if (ageDays <= PLAN_CONTEXT_RECENT_DAYS)
                    recent.push(p);
            }
            if (recent.length > 0) {
                candidates = recent;
                reason = 'recent-active-fallback';
            }
            else {
                candidates = [];
                reason = 'no-area-today';
            }
        }
    }
    // ---- 2. Rank candidates (recency desc, slug asc) + cap ----------------
    const ranked = [];
    for (const p of candidates) {
        const mod = await deps.storage.getModified(p.readmePath);
        ranked.push({ slug: p.slug, status: p.status, mtimeMs: mod ? mod.getTime() : 0 });
    }
    ranked.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const chosen = ranked.slice(0, maxProjects);
    // ---- 3. Per-project selection (shared budget — R9) --------------------
    // Share the expanded budget across the chosen projects so ≥1 doc expands
    // per project when one fits; selectProjectDocs' zero-result safety also
    // guarantees ≥1 expanded doc when the project has any doc at all.
    const perProjectBudget = Math.max(1, Math.floor(budgetChars / Math.max(1, chosen.length)));
    const projects = [];
    for (const c of chosen) {
        const meta = candidates.find((p) => p.slug === c.slug);
        let selection = null;
        try {
            selection = await selectProjectDocs(c.slug, paths, { storage: deps.storage }, {
                topic: meta?.name ?? c.slug,
                queryExtra: [meta?.area ?? '', `${meta?.name ?? ''} ${c.slug}`]
                    .filter(Boolean)
                    .join(' '),
                budgetChars: perProjectBudget,
                locationBoost: true, // plan/agenda prep treats outputs/working as first-class
                referenceDate,
            });
        }
        catch {
            selection = null; // best-effort — a single project must never break the bundle
        }
        const selectedDocs = selection ? toSelectedDocs(c.slug, selection) : [];
        const openQuestions = [];
        if (selection) {
            for (const d of selection.expanded) {
                for (const q of extractOpenQuestions(d.body)) {
                    if (!openQuestions.includes(q))
                        openQuestions.push(q);
                    if (openQuestions.length >= OPEN_QUESTIONS_CAP)
                        break;
                }
                if (openQuestions.length >= OPEN_QUESTIONS_CAP)
                    break;
            }
        }
        let whatsNew = null;
        try {
            whatsNew = toWhatsNew(await assembleProjectWhatsNew(c.slug, paths, {
                storage: deps.storage,
                commitments: deps.commitments,
                topicMemory: deps.topicMemory,
                areaMemory: deps.areaMemory,
                entities: deps.entities,
            }));
        }
        catch {
            whatsNew = null;
        }
        projects.push({
            slug: c.slug,
            status: c.status ?? null,
            whatsNew,
            selectedDocs,
            openQuestions,
            source: 'project',
            ...(selection?.lowConfidence ? { lowConfidence: true } : {}),
        });
    }
    // ---- 4. Active topics (filtered to today's areas for --day) -----------
    const topics = [];
    try {
        const { topics: allTopics } = await deps.topicMemory.listAll(paths);
        let activeTopicEntries = getActiveTopics(allTopics, {
            today: referenceDate,
        });
        if (mode === 'day' && reason === undefined) {
            // Scope topics to today's areas when the day bound to areas cleanly.
            const todayAreas = opts.todayAreas ?? (await resolveTodayAreas(deps, paths, referenceDate));
            const areaSet = new Set(todayAreas);
            activeTopicEntries = activeTopicEntries.filter((t) => !t.area || areaSet.has(t.area));
        }
        for (const t of activeTopicEntries) {
            topics.push({
                slug: t.slug,
                ...(t.area ? { area: t.area } : {}),
                status: t.status,
                summary: t.summary,
                source: 'topic',
            });
        }
    }
    catch {
        // best-effort — a topic-store failure must not break the bundle
    }
    // ---- 5. Goals crosswalk (file list only — no body parse) --------------
    const goals = [];
    try {
        const goalFiles = await deps.storage.list(paths.goals, { extensions: ['.md'] });
        for (const abs of goalFiles.sort()) {
            const base = abs.slice(abs.lastIndexOf('/') + 1).replace(/\.md$/i, '');
            goals.push({
                rel: `goals/${base}.md`,
                title: base.replace(/[-_]+/g, ' ').trim() || base,
                source: 'goal',
            });
        }
    }
    catch {
        // best-effort — goals/ may be absent
    }
    // ---- 6. Last week's plan ---------------------------------------------
    let lastWeek = null;
    try {
        lastWeek = (await deps.storage.read(join(paths.now, 'week.md'))) ?? null;
    }
    catch {
        lastWeek = null;
    }
    return {
        mode,
        projects,
        topics,
        goals,
        lastWeek,
        generatedAt: referenceDate.toISOString(),
        ...(reason ? { reason } : {}),
    };
}
//# sourceMappingURL=plan-context.js.map