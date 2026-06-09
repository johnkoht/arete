/**
 * Meeting apply service — applies extracted intelligence to meeting files.
 *
 * Writes staged sections and updates frontmatter, but does NOT touch
 * people files or commitments. The separation allows for composable
 * meeting processing pipelines.
 *
 * Used by `arete meeting apply <file>` CLI command.
 */
import { resolve } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { formatStagedSections, updateMeetingContent } from './meeting-extraction.js';
import { writeMeetingSummaryFromFrontmatter } from './summary-writer.js';
import { refreshOrgs } from './org-entity.js';
import { writeMeetingApplyFrontmatter } from './meeting-frontmatter.js';
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match)
        return { data: {}, body: content };
    try {
        const data = parseYaml(match[1]);
        return { data, body: match[2] };
    }
    catch {
        return { data: {}, body: content };
    }
}
function serializeFrontmatter(data, body) {
    const fm = stringifyYaml(data).trimEnd();
    return `---\n${fm}\n---\n\n${body.replace(/^\n+/, '')}`;
}
// ---------------------------------------------------------------------------
// Content manipulation helpers
// ---------------------------------------------------------------------------
/**
 * Headers that are part of staged sections.
 */
const STAGED_HEADERS = new Set([
    'summary',
    'core',
    'could include',
    'staged action items',
    'staged decisions',
    'staged learnings',
]);
/**
 * Remove all staged sections from meeting body content.
 * Removes: `## Summary`, `## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings`
 * and all content until the next `##` header that is not a staged header.
 */
export function clearStagedSections(content) {
    const lines = content.split('\n');
    const result = [];
    let skipping = false;
    for (const line of lines) {
        // Check for section headers
        const headerMatch = line.match(/^## (.+)$/);
        if (headerMatch) {
            const headerName = headerMatch[1].trim().toLowerCase();
            if (STAGED_HEADERS.has(headerName)) {
                skipping = true;
                continue;
            }
            else {
                // Non-staged header - stop skipping and include this line
                skipping = false;
            }
        }
        if (!skipping) {
            result.push(line);
        }
    }
    // Trim trailing blank lines
    while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
    }
    return result.join('\n');
}
// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------
/**
 * Apply extracted intelligence to a meeting file.
 *
 * This function:
 * 1. Reads the meeting file
 * 2. Optionally clears existing staged sections (if options.clear)
 * 3. Formats and writes staged sections (Summary, Action Items, Decisions, Learnings)
 * 4. Updates frontmatter: status: processed, processed_at: <timestamp>
 * 5. Archives linked agenda (if present and not skipped)
 *
 * Does NOT touch people files or commitments.
 *
 * @param meetingPath - Path to the meeting file (absolute or relative to workspaceRoot)
 * @param intelligence - Extracted meeting intelligence (from extractMeetingIntelligence)
 * @param deps - Dependencies (storage, workspaceRoot)
 * @param options - Optional flags (skipAgenda, clear)
 * @returns Result with counts and warnings
 */
export async function applyMeetingIntelligence(meetingPath, intelligence, deps, options = {}) {
    const { storage, workspaceRoot } = deps;
    const warnings = [];
    // Resolve path
    const absPath = meetingPath.startsWith('/')
        ? meetingPath
        : resolve(workspaceRoot, meetingPath);
    // 1. Read meeting file
    const content = await storage.read(absPath);
    if (!content) {
        throw new Error(`Meeting file not found: ${meetingPath}`);
    }
    // 2. Parse frontmatter and body
    let { data, body } = parseFrontmatter(content);
    // 3. Optionally clear existing staged sections
    if (options.clear) {
        body = clearStagedSections(body);
    }
    // 4. Format staged sections from intelligence
    // Build a MeetingExtractionResult wrapper for formatStagedSections
    const extractionResult = {
        intelligence,
        validationWarnings: [],
        rawItems: [],
    };
    const stagedSections = formatStagedSections(extractionResult);
    // 5. Update meeting content with staged sections
    const updatedBody = updateMeetingContent(body, stagedSections);
    // 6. Update frontmatter — unified writer (phase-3-5-followup-5 AC1).
    //
    // Alias/merge pass (Phase A #1 of topic-wiki-memory): coerce LLM-proposed
    // slugs against existing topic pages so near-duplicates (e.g.,
    // `cover-whale-email-templates` → `cover-whale-templates`) collapse to
    // one canonical slug instead of sprawling into two topic pages on next
    // refresh. Skipped when `options.skipTopicAlias` or when dependencies
    // aren't provided (pre-topic-wiki-memory behavior).
    await writeMeetingApplyFrontmatter(data, intelligence, { status: 'processed', processedAt: new Date().toISOString() }, {
        topicMemory: deps.topicMemory,
        workspacePaths: deps.workspacePaths,
        callLLM: deps.callLLM,
        skipTopicAlias: options.skipTopicAlias,
        onWarning: (msg) => warnings.push(msg),
    });
    // 7. Write meeting file
    const updatedContent = serializeFrontmatter(data, updatedBody);
    await storage.write(absPath, updatedContent);
    // 8. Archive linked agenda (if present and not skipped)
    let agendaArchived = null;
    if (!options.skipAgenda) {
        const agendaPath = data['agenda'];
        if (agendaPath) {
            const absAgendaPath = agendaPath.startsWith('/')
                ? agendaPath
                : resolve(workspaceRoot, agendaPath);
            const agendaContent = await storage.read(absAgendaPath);
            if (agendaContent) {
                const agendaResult = parseFrontmatter(agendaContent);
                agendaResult.data['status'] = 'processed';
                const updatedAgenda = serializeFrontmatter(agendaResult.data, agendaResult.body);
                await storage.write(absAgendaPath, updatedAgenda);
                agendaArchived = agendaPath;
            }
            else {
                warnings.push(`Linked agenda not found: ${agendaPath}`);
            }
        }
    }
    // 9. Write per-meeting summary file (Phase 1 §a.1).
    //
    // Hook lives AFTER frontmatter is finalized (so the summary inherits
    // resolved topics, importance, participants) and AFTER the meeting
    // file is written (so summary parses the same body the user reads).
    // The writer is idempotent on body content_hash — reprocessing the
    // same meeting is a no-op against an unchanged body.
    let summaryPath = null;
    let summaryWritten = false;
    if (!options.skipSummary) {
        try {
            // Derivation (date/area/importance/topics/participants) is shared
            // with the `arete meeting approve` summary hook via
            // `writeMeetingSummaryFromFrontmatter` (wiki-repair W2 — single
            // derivation path so the two writers can never diverge). Hash on
            // body alone, mirroring topic-memory.hashMeetingSource —
            // frontmatter changes (status bumps, item counts) don't bust
            // dedup. `data['topics']` carries the post-alias-coerce result
            // the unified writer just wrote; `could_include` headlines feed
            // the summary's `## FYI` section (body-block rendering on the
            // source file was removed in Phase 1).
            const summaryResult = await writeMeetingSummaryFromFrontmatter({
                absPath,
                frontmatter: data,
                body: updatedBody,
                couldInclude: intelligence.could_include,
            }, { storage, workspaceRoot, callLLM: deps.callLLM });
            if (summaryResult !== null) {
                summaryPath = summaryResult.summaryPath;
                summaryWritten = summaryResult.written;
                for (const w of summaryResult.warnings)
                    warnings.push(w);
            }
        }
        catch (err) {
            // Summary is non-fatal; meeting apply succeeded.
            warnings.push(`summary writer failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`);
        }
    }
    // 10. Refresh org-entity pages (Phase 1 §b).
    //
    // Auto-detection scans recent meetings for non-internal email domains
    // and writes/updates pages under .arete/memory/entities/orgs/. The
    // scan runs on every meeting apply because:
    //   - Detection threshold (≥2 distinct meetings in 90d) is cheap to
    //     re-evaluate; expensive part is only triggered when an org
    //     newly qualifies.
    //   - Existing pages are byte-equal-skipped when content hasn't
    //     changed.
    // Caller can disable via `options.skipOrgEntities`. No LLM cost; runs
    // independently of `deps.callLLM`.
    let orgsRefreshed = [];
    if (!options.skipOrgEntities && deps.workspacePaths !== undefined) {
        try {
            const result = await refreshOrgs(deps.workspacePaths, storage, {
                // Pass `today` from the meeting apply so detection windows are
                // deterministic relative to the meeting being processed (not
                // wall-clock at write time).
                today: new Date().toISOString().slice(0, 10),
            });
            orgsRefreshed = result.written;
            for (const w of result.warnings)
                warnings.push(w);
        }
        catch (err) {
            warnings.push(`org-entity refresh failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`);
        }
    }
    return {
        meetingPath: absPath,
        actionItemsStaged: intelligence.actionItems.length,
        decisionsStaged: intelligence.decisions.length,
        learningsStaged: intelligence.learnings.length,
        agendaArchived,
        summaryPath,
        summaryWritten,
        orgsRefreshed,
        warnings,
    };
}
//# sourceMappingURL=meeting-apply.js.map