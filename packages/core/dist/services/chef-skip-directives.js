/**
 * Chef-skip directive parser (phase-10-followup-2 Step 6).
 *
 * Parses `[[unskip <id>]]` and `[[confirm-skip <id>]]` directives from
 * winddown view content and resolves them against meeting files in the
 * workspace.
 *
 * Pre-condition #2 from plan v3: Phase 10's `[[unmerge]]` directive is
 * specified but the parser does not yet exist. The phase-10-followup-2
 * parser built here IS the directive infrastructure for the project;
 * `[[unmerge]]` will follow this precedent (parser shape, meeting-file
 * resolver, audit log conventions).
 *
 * Both id-alone and slug-qualified forms are accepted from day 1 (PM C4):
 *
 *   [[unskip ai_0042]]                          -- id-alone
 *   [[unskip john-jamie-2026-06-04:ai_0042]]    -- slug-qualified
 *   [[confirm-skip ai_0099]]                    -- id-alone
 *   [[confirm-skip glance-2:ai_0099]]           -- slug-qualified
 *
 * Resolver scan strategy (F3 mitigation): scan meeting files in the
 * workspace where `staged_item_status` is non-empty (these are the
 * only files where unskip/confirm has any effect). Cap at N=50 most-
 * recent-mtime if the candidate list exceeds.
 *
 * Disambiguation rules:
 *   - id-alone matches 2+ → NO-OP, surface "ambiguous — please qualify"
 *   - id-alone matches 0 → NO-OP, surface "no match — may have already
 *     been processed"
 *   - slug-qualified → exact meeting file (no scan needed)
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseStagedItemStatus } from '../integrations/staged-items.js';
// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
// Capture groups:
//   1 = kind ('unskip' | 'confirm-skip')
//   2 = optional slug (may be undefined)
//   3 = id (ai_NNN / de_NNN / le_NNN)
const DIRECTIVE_PATTERN = /\[\[(unskip|confirm-skip)\s+(?:([a-z0-9-]+):)?(ai_\d+|de_\d+|le_\d+)\]\]/gi;
/**
 * Parse all `[[unskip <id>]]` and `[[confirm-skip <id>]]` directives from
 * winddown view content. Returns one entry per occurrence; duplicates are
 * preserved (caller may dedupe).
 */
export function parseChefSkipDirectives(content) {
    const results = [];
    // Reset regex state since we use the /g flag.
    DIRECTIVE_PATTERN.lastIndex = 0;
    let match;
    while ((match = DIRECTIVE_PATTERN.exec(content)) !== null) {
        const [raw, kindRaw, slugRaw, id] = match;
        const kind = kindRaw.toLowerCase();
        results.push({
            kind,
            id,
            slug: slugRaw ?? null,
            raw,
        });
    }
    return results;
}
// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------
const MAX_CANDIDATE_SCAN = 50;
/**
 * Resolve a single directive to a meeting file path. Slug-qualified
 * directives skip the scan and resolve directly; id-alone directives
 * scan meeting files for ones with `staged_item_status` populated.
 *
 * Scan strategy (F3): we list meeting files, sort by mtime descending,
 * cap at MAX_CANDIDATE_SCAN, parse each one's frontmatter, keep those
 * with `staged_item_status[id]` defined. Returns 'ambiguous' if 2+ match.
 */
export async function resolveChefSkipDirective(storage, directive, options) {
    const meetingsDir = options.meetingsDir ?? 'resources/meetings';
    const meetingsRoot = join(options.workspaceRoot, meetingsDir);
    // Slug-qualified — exact path. We attempt `<meetingsRoot>/<slug>.md`
    // first; if that doesn't exist, treat as invalid-slug.
    if (directive.slug !== null) {
        const candidatePath = join(meetingsRoot, `${directive.slug}.md`);
        const content = await storage.read(candidatePath);
        if (content === null) {
            return {
                ...directive,
                status: 'invalid-slug',
                meetingPath: null,
                candidates: [],
            };
        }
        const status = parseStagedItemStatus(content);
        if (!(directive.id in status)) {
            return {
                ...directive,
                status: 'invalid-slug',
                meetingPath: null,
                candidates: [candidatePath],
            };
        }
        return {
            ...directive,
            status: 'resolved',
            meetingPath: candidatePath,
            candidates: [candidatePath],
        };
    }
    // id-alone — scan meeting files.
    let meetingFiles;
    try {
        const allFiles = await storage.list(meetingsRoot);
        meetingFiles = allFiles.filter((f) => f.endsWith('.md'));
    }
    catch {
        meetingFiles = [];
    }
    // Sort by mtime descending; cap at MAX_CANDIDATE_SCAN.
    const withMtime = [];
    for (const f of meetingFiles) {
        const fullPath = f.startsWith('/') ? f : join(meetingsRoot, f);
        try {
            const st = await stat(fullPath);
            withMtime.push({ path: fullPath, mtimeMs: st.mtimeMs });
        }
        catch {
            // Skip files we can't stat (e.g. storage adapters without real fs).
            withMtime.push({ path: fullPath, mtimeMs: 0 });
        }
    }
    withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const scanList = withMtime.slice(0, MAX_CANDIDATE_SCAN);
    const candidates = [];
    for (const { path } of scanList) {
        const content = await storage.read(path);
        if (content === null)
            continue;
        const status = parseStagedItemStatus(content);
        if (directive.id in status) {
            candidates.push(path);
        }
    }
    if (candidates.length === 0) {
        return {
            ...directive,
            status: 'no-match',
            meetingPath: null,
            candidates: [],
        };
    }
    if (candidates.length > 1) {
        return {
            ...directive,
            status: 'ambiguous',
            meetingPath: null,
            candidates,
        };
    }
    return {
        ...directive,
        status: 'resolved',
        meetingPath: candidates[0],
        candidates,
    };
}
/**
 * Build the human-readable error/info message for a directive that
 * didn't resolve cleanly. The caller surfaces this in the next winddown
 * view so the user can see why their directive didn't take effect.
 */
export function formatDirectiveStatusMessage(d) {
    switch (d.status) {
        case 'resolved':
            return null;
        case 'ambiguous': {
            const slugs = d.candidates
                .map((p) => p.replace(/^.*\//, '').replace(/\.md$/, ''))
                .join(', ');
            return (`[[${d.kind} ${d.id}]] is ambiguous — found in multiple meetings: ` +
                `${slugs}. Please qualify: \`[[${d.kind} <slug>:${d.id}]]\`.`);
        }
        case 'no-match':
            return (`[[${d.kind} ${d.id}]] — no match. The item may have already been ` +
                `processed (committed or cleared on apply), or the id may be a typo.`);
        case 'invalid-slug':
            return (`[[${d.kind} ${d.slug}:${d.id}]] — slug-qualified meeting was not ` +
                `found OR does not contain that item id. Check the slug spelling.`);
    }
}
//# sourceMappingURL=chef-skip-directives.js.map