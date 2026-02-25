/**
 * Conversation save logic — uses StorageAdapter, no direct fs.
 * Follows saveMeetingFile() pattern from ../meetings.ts.
 */
import { join } from 'path';
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Generate a filename for a conversation artifact.
 * Format: {date}-{title-slug}.md
 */
export function conversationFilename(conversation) {
    let dateStr = conversation.date;
    if (dateStr?.includes('T'))
        dateStr = dateStr.slice(0, 10);
    if (!dateStr)
        dateStr = new Date().toISOString().slice(0, 10);
    const titleSlug = slugify(conversation.title || 'untitled');
    return `${dateStr}-${titleSlug}.md`;
}
/**
 * Render a conversation as markdown with YAML frontmatter.
 */
function renderConversationMarkdown(conversation) {
    const { title, date, source, participants, rawTranscript, normalizedContent, insights, provenance, participantIds } = conversation;
    // Frontmatter
    const frontmatterLines = [
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `date: "${date}"`,
        `source: "${source}"`,
        `captured_at: "${provenance.capturedAt}"`,
    ];
    // Only write participant_ids when participantIds is defined (flow style: [slug1, slug2])
    if (participantIds !== undefined) {
        frontmatterLines.push(`participant_ids: [${participantIds.join(', ')}]`);
    }
    frontmatterLines.push('---');
    const frontmatter = frontmatterLines.join('\n');
    // Sections
    const sections = [];
    sections.push(`# ${title}`);
    sections.push(`**Date**: ${date}`);
    sections.push(`**Source**: ${source}`);
    if (participants.length > 0) {
        sections.push(`\n## Participants\n${participants.map(p => `- ${p}`).join('\n')}`);
    }
    // Insights — only include sections that have content
    if (insights.summary) {
        sections.push(`\n## Summary\n${insights.summary}`);
    }
    if (insights.decisions && insights.decisions.length > 0) {
        sections.push(`\n## Decisions\n${insights.decisions.map(d => `- ${d}`).join('\n')}`);
    }
    if (insights.actionItems && insights.actionItems.length > 0) {
        sections.push(`\n## Action Items\n${insights.actionItems.map(a => `- [ ] ${a}`).join('\n')}`);
    }
    if (insights.openQuestions && insights.openQuestions.length > 0) {
        sections.push(`\n## Open Questions\n${insights.openQuestions.map(q => `- ${q}`).join('\n')}`);
    }
    if (insights.stakeholders && insights.stakeholders.length > 0) {
        sections.push(`\n## Stakeholders\n${insights.stakeholders.map(s => `- ${s}`).join('\n')}`);
    }
    if (insights.risks && insights.risks.length > 0) {
        sections.push(`\n## Risks\n${insights.risks.map(r => `- ${r}`).join('\n')}`);
    }
    if (normalizedContent) {
        sections.push(`\n## Conversation\n${normalizedContent}`);
    }
    if (rawTranscript) {
        sections.push(`\n## Raw Transcript\n${rawTranscript}`);
    }
    return frontmatter + '\n\n' + sections.join('\n') + '\n';
}
/**
 * Save a conversation artifact to disk as a markdown file.
 *
 * @returns The full path of the saved file, or null if the file already exists (and force is false).
 */
export async function saveConversationFile(storage, conversation, outputDir, options = {}) {
    const { force = false } = options;
    const filename = conversationFilename(conversation);
    const fullPath = join(outputDir, filename);
    const exists = await storage.exists(fullPath);
    if (!force && exists)
        return null;
    const content = renderConversationMarkdown(conversation);
    await storage.mkdir(outputDir);
    await storage.write(fullPath, content);
    return fullPath;
}
/**
 * Patch the `participant_ids` field in a saved conversation file's YAML frontmatter.
 *
 * Uses string-level replacement (not YAML round-trip) to preserve all other content.
 * Inserts the field before the closing `---` if not already present.
 * No-op if the file doesn't exist or has no recognizable frontmatter.
 * Never throws.
 */
export async function updateConversationFrontmatter(storage, filePath, participantIds) {
    try {
        const exists = await storage.exists(filePath);
        if (!exists)
            return;
        const content = await storage.read(filePath);
        if (!content)
            return;
        // Must start with a frontmatter block
        if (!content.startsWith('---'))
            return;
        // Find closing ---
        const closingIdx = content.indexOf('\n---', 3);
        if (closingIdx === -1)
            return;
        const newLine = `participant_ids: [${participantIds.join(', ')}]`;
        // Check if participant_ids already exists — scoped to frontmatter slice to avoid
        // matching a `participant_ids:` occurrence in the body. When a match is found here,
        // the first `^participant_ids:` in the full file is always the frontmatter line
        // (frontmatter precedes body), so the full-content replace below is safe.
        const frontmatter = content.slice(0, closingIdx);
        const existingMatch = frontmatter.match(/^participant_ids:.*$/m);
        let nextContent;
        if (existingMatch) {
            // Replace the existing line (safe: first match in file == frontmatter match)
            nextContent = content.replace(/^participant_ids:.*$/m, newLine);
        }
        else {
            // Insert before the closing ---
            nextContent = content.slice(0, closingIdx) + '\n' + newLine + content.slice(closingIdx);
        }
        if (nextContent !== content) {
            await storage.write(filePath, nextContent);
        }
    }
    catch {
        // Never throw — writeback failure is non-fatal
    }
}
//# sourceMappingURL=save.js.map