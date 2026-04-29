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
    // 6. Update frontmatter
    data['status'] = 'processed';
    data['processed_at'] = new Date().toISOString();
    // Write topics + item counts for agent-facing frontmatter.
    //
    // Alias/merge pass (Phase A #1 of topic-wiki-memory): coerce LLM-proposed
    // slugs against existing topic pages so near-duplicates (e.g.,
    // `cover-whale-email-templates` → `cover-whale-templates`) collapse to
    // one canonical slug instead of sprawling into two topic pages on next
    // refresh. Skipped when `options.skipTopicAlias` or when dependencies
    // aren't provided (pre-topic-wiki-memory behavior).
    const proposedTopics = intelligence.topics ?? [];
    let normalizedTopics = proposedTopics;
    if (!options.skipTopicAlias &&
        deps.topicMemory !== undefined &&
        deps.workspacePaths !== undefined &&
        proposedTopics.length > 0) {
        try {
            const { TopicMemoryService } = await import('./topic-memory.js');
            const { topics: existingPages } = await deps.topicMemory.listAll(deps.workspacePaths);
            const existingIdentities = TopicMemoryService.toIdentities(existingPages);
            const aliasResults = await deps.topicMemory.aliasAndMerge(proposedTopics, existingIdentities, { callLLM: deps.callLLM });
            normalizedTopics = aliasResults.map((r) => r.resolved);
        }
        catch (err) {
            warnings.push(`topic alias/merge failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`);
        }
    }
    data['topics'] = normalizedTopics;
    data['open_action_items'] = intelligence.actionItems.length;
    data['my_commitments'] = intelligence.actionItems.filter(i => i.direction === 'i_owe_them').length;
    data['their_commitments'] = intelligence.actionItems.filter(i => i.direction === 'they_owe_me').length;
    data['decisions_count'] = intelligence.decisions.length;
    data['learnings_count'] = intelligence.learnings.length;
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
    return {
        meetingPath: absPath,
        actionItemsStaged: intelligence.actionItems.length,
        decisionsStaged: intelligence.decisions.length,
        learningsStaged: intelligence.learnings.length,
        agendaArchived,
        warnings,
    };
}
//# sourceMappingURL=meeting-apply.js.map