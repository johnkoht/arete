/**
 * Workspace service — meeting file operations for the backend.
 * Uses gray-matter for frontmatter parsing and @arete/core for file I/O.
 */
import { join } from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import { FileStorageAdapter, parseStagedSections, parseStagedItemStatus, parseStagedItemEdits, writeItemStatusToFile, commitApprovedItems, loadConfig, refreshQmdIndex, createServices, } from '@arete/core';
const storage = new FileStorageAdapter();
function meetingsDir(workspaceRoot) {
    return join(workspaceRoot, 'resources', 'meetings');
}
function slugToPath(workspaceRoot, slug) {
    return join(meetingsDir(workspaceRoot), `${slug}.md`);
}
/**
 * Safely extract a date string from frontmatter.
 * YAML may parse unquoted dates as Date objects, so handle both string and Date.
 */
function extractDate(value) {
    if (typeof value === 'string')
        return value;
    if (value instanceof Date)
        return value.toISOString();
    return '';
}
function parseAttendees(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw.map((a) => {
        if (typeof a === 'string')
            return { name: a, email: '' };
        if (a && typeof a === 'object') {
            const obj = a;
            return {
                name: typeof obj['name'] === 'string' ? obj['name'] : '',
                email: typeof obj['email'] === 'string' ? obj['email'] : '',
            };
        }
        return { name: '', email: '' };
    });
}
function extractDuration(fm, body) {
    // Check frontmatter first
    if (fm['duration'] && typeof fm['duration'] === 'string') {
        return fm['duration'];
    }
    if (fm['duration'] && typeof fm['duration'] === 'number') {
        return `${fm['duration']} minutes`;
    }
    // Try ## Duration section in body
    const sectionMatch = body.match(/^##\s+Duration\s*\n([^\n#]+)/im);
    if (sectionMatch)
        return sectionMatch[1].trim();
    // Try **Duration**: X format (Krisp style)
    const boldMatch = body.match(/\*\*Duration\*\*:\s*(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
    if (boldMatch)
        return boldMatch[1].trim();
    return '';
}
function extractSummary(fm, body) {
    // Check frontmatter first
    if (fm['summary'] && typeof fm['summary'] === 'string') {
        return fm['summary'];
    }
    // Try ## Summary section in body
    const match = body.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
    if (match) {
        const summaryText = match[1].trim();
        // Skip placeholder text
        if (summaryText && summaryText.toLowerCase() !== 'no summary available.' && summaryText !== '') {
            return summaryText;
        }
    }
    return '';
}
/**
 * Parse a markdown section with list items into an array of item objects.
 * Handles both plain items (- text) and checkbox items (- [ ] text, - [x] text).
 */
function parseListSection(body, sectionName) {
    // Note: Can't use $ with 'm' flag as it matches end-of-line, not end-of-string
    // Instead, match until next ## header, --- divider, or end of content
    const regex = new RegExp(`^##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---)`, 'im');
    let match = body.match(regex);
    // If no match with lookahead, try matching to end of string (section is last in file)
    if (!match) {
        const endRegex = new RegExp(`^##\\s+${sectionName}\\s*\\n([\\s\\S]*)$`, 'im');
        match = body.match(endRegex);
    }
    if (!match)
        return [];
    const content = match[1];
    const items = [];
    // Match list items: - [ ] text, - [x] text, - [X] text, or just - text
    const lines = content.split('\n');
    for (const line of lines) {
        // Checkbox format: - [ ] or - [x] or - [X]
        const checkboxMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
        if (checkboxMatch) {
            items.push({
                text: checkboxMatch[2].trim(),
                completed: checkboxMatch[1].toLowerCase() === 'x',
            });
            continue;
        }
        // Plain format: - text
        const plainMatch = line.match(/^-\s+(.+)$/);
        if (plainMatch) {
            items.push({ text: plainMatch[1].trim() });
        }
    }
    return items;
}
/**
 * Extract transcript from body (everything under ## Transcript header).
 */
function extractTranscript(body) {
    const match = body.match(/^##\s+Transcript\s*\n([\s\S]*)$/im);
    return match ? match[1].trim() : '';
}
/**
 * Detect meeting status based on content.
 *
 * Status hierarchy:
 * 1. Explicit frontmatter status takes precedence
 * 2. Has approved_items frontmatter → approved
 * 3. Has "## Staged X" sections → processed (pending review in new UI)
 * 4. Has "## Action Items" (no Staged prefix) with content → approved (old format, already committed)
 * 5. Has Summary/Key Points → processed
 * 6. Otherwise → synced
 *
 * Returns lowercase status (frontend handles display formatting).
 */
function detectMeetingStatus(fm, body) {
    // Explicit frontmatter status takes precedence (normalize to lowercase)
    if (typeof fm['status'] === 'string') {
        return fm['status'].toLowerCase();
    }
    // Has approved_items in frontmatter → approved
    if (fm['approved_items'] && typeof fm['approved_items'] === 'object') {
        return 'approved';
    }
    // Has staged sections → processed (pending review)
    const hasStagedSections = /^##\s+Staged\s+(Action Items|Decisions|Learnings)\s*\n/im.test(body);
    if (hasStagedSections) {
        return 'processed';
    }
    // Has non-staged Action Items with real content → approved (old format, already committed)
    const actionItemsMatch = body.match(/^##\s+Action Items\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
    if (actionItemsMatch) {
        const content = actionItemsMatch[1].trim();
        // Skip placeholder text
        if (content &&
            !content.toLowerCase().includes('no action items') &&
            /^-\s+(\[.\]\s+)?/m.test(content)) { // matches "- " or "- [ ] " or "- [x] "
            return 'approved';
        }
    }
    // Has Decisions or Learnings sections with real content → approved
    const decisionsMatch = body.match(/^##\s+Decisions\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
    if (decisionsMatch) {
        const content = decisionsMatch[1].trim();
        if (content && !content.toLowerCase().includes('no decisions') && /^-\s+/m.test(content)) {
            return 'approved';
        }
    }
    const learningsMatch = body.match(/^##\s+Learnings\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
    if (learningsMatch) {
        const content = learningsMatch[1].trim();
        if (content && !content.toLowerCase().includes('no learnings') && /^-\s+/m.test(content)) {
            return 'approved';
        }
    }
    // Has Summary with real content → processed (but no items extracted yet)
    const summaryMatch = body.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
    const hasSummary = summaryMatch &&
        summaryMatch[1].trim() &&
        !summaryMatch[1].toLowerCase().includes('no summary available');
    // Has Key Points with real content
    const keyPointsMatch = body.match(/^##\s+Key Points\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
    const hasKeyPoints = keyPointsMatch &&
        keyPointsMatch[1].trim() &&
        !keyPointsMatch[1].toLowerCase().includes('no key points');
    if (hasSummary || hasKeyPoints) {
        return 'processed';
    }
    return 'synced';
}
export async function listMeetings(workspaceRoot) {
    const dir = meetingsDir(workspaceRoot);
    let entries;
    try {
        entries = await fs.readdir(dir);
    }
    catch {
        return [];
    }
    const summaries = [];
    for (const entry of entries) {
        if (!entry.endsWith('.md'))
            continue;
        const slug = entry.slice(0, -3);
        const filePath = join(dir, entry);
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            const { data, content } = matter(raw);
            const fm = data;
            summaries.push({
                slug,
                title: typeof fm['title'] === 'string' ? fm['title'] : slug,
                date: extractDate(fm['date']),
                status: detectMeetingStatus(fm, content),
                attendees: parseAttendees(fm['attendees']),
                duration: extractDuration(fm, content),
                source: typeof fm['source'] === 'string' ? fm['source'] : '',
                recordingUrl: typeof fm['recording_link'] === 'string' ? fm['recording_link'] : '',
            });
        }
        catch {
            // skip unreadable files
        }
    }
    // Sort by date descending
    summaries.sort((a, b) => b.date.localeCompare(a.date));
    return summaries;
}
/** Parse `staged_item_source` from meeting file frontmatter. */
function parseStagedItemSource(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
        return {};
    try {
        const fm = matter(content).data;
        const raw = fm['staged_item_source'];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return {};
        // Validate values are 'ai' or 'dedup'
        const result = {};
        for (const [key, val] of Object.entries(raw)) {
            if (val === 'ai' || val === 'dedup') {
                result[key] = val;
            }
        }
        return result;
    }
    catch {
        return {};
    }
}
/** Parse `staged_item_confidence` from meeting file frontmatter. */
function parseStagedItemConfidence(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
        return {};
    try {
        const fm = matter(content).data;
        const raw = fm['staged_item_confidence'];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return {};
        // Validate values are numbers
        const result = {};
        for (const [key, val] of Object.entries(raw)) {
            if (typeof val === 'number') {
                result[key] = val;
            }
        }
        return result;
    }
    catch {
        return {};
    }
}
export async function getMeeting(workspaceRoot, slug) {
    const filePath = slugToPath(workspaceRoot, slug);
    let raw;
    try {
        raw = await fs.readFile(filePath, 'utf8');
    }
    catch {
        return null;
    }
    const { data, content } = matter(raw);
    const fm = data;
    const stagedSections = parseStagedSections(content);
    const stagedItemStatus = parseStagedItemStatus(raw);
    const stagedItemEdits = parseStagedItemEdits(raw);
    const stagedItemSource = parseStagedItemSource(raw);
    const stagedItemConfidence = parseStagedItemConfidence(raw);
    // Apply sources and confidence to staged items
    for (const item of stagedSections.actionItems) {
        item.source = stagedItemSource[item.id] ?? 'ai';
        item.confidence = stagedItemConfidence[item.id];
    }
    for (const item of stagedSections.decisions) {
        item.source = stagedItemSource[item.id] ?? 'ai';
        item.confidence = stagedItemConfidence[item.id];
    }
    for (const item of stagedSections.learnings) {
        item.source = stagedItemSource[item.id] ?? 'ai';
        item.confidence = stagedItemConfidence[item.id];
    }
    // Parse approved_items from frontmatter if present
    const rawApproved = fm['approved_items'];
    const approvedItems = {
        actionItems: [],
        decisions: [],
        learnings: [],
    };
    if (rawApproved && typeof rawApproved === 'object' && !Array.isArray(rawApproved)) {
        const ra = rawApproved;
        if (Array.isArray(ra['actionItems']))
            approvedItems.actionItems = ra['actionItems'].filter((x) => typeof x === 'string');
        if (Array.isArray(ra['decisions']))
            approvedItems.decisions = ra['decisions'].filter((x) => typeof x === 'string');
        if (Array.isArray(ra['learnings']))
            approvedItems.learnings = ra['learnings'].filter((x) => typeof x === 'string');
    }
    // Parse sections from body (for old meetings or detailed view)
    const parsedSections = {
        actionItems: parseListSection(content, 'Action Items'),
        decisions: parseListSection(content, 'Decisions'),
        learnings: parseListSection(content, 'Learnings'),
    };
    return {
        slug,
        title: typeof fm['title'] === 'string' ? fm['title'] : slug,
        date: extractDate(fm['date']),
        status: detectMeetingStatus(fm, content),
        attendees: parseAttendees(fm['attendees']),
        duration: extractDuration(fm, content),
        source: typeof fm['source'] === 'string' ? fm['source'] : '',
        recordingUrl: typeof fm['recording_link'] === 'string' ? fm['recording_link'] : '',
        summary: extractSummary(fm, content),
        body: content,
        transcript: extractTranscript(content),
        frontmatter: fm,
        stagedSections,
        stagedItemStatus,
        stagedItemEdits,
        approvedItems,
        parsedSections,
    };
}
export async function deleteMeeting(workspaceRoot, slug) {
    const filePath = slugToPath(workspaceRoot, slug);
    await fs.unlink(filePath);
    // Refresh QMD index — non-fatal on failure
    try {
        const config = await loadConfig(storage, workspaceRoot);
        await refreshQmdIndex(workspaceRoot, config.qmd_collection ?? 'arete');
    }
    catch (err) {
        console.error('[backend] QMD refresh failed after delete:', err);
    }
}
export async function updateMeeting(workspaceRoot, slug, updates) {
    const filePath = slugToPath(workspaceRoot, slug);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data;
    if (updates.title !== undefined)
        fm['title'] = updates.title;
    if (updates.summary !== undefined)
        fm['summary'] = updates.summary;
    const updated = matter.stringify(parsed.content, fm);
    await fs.writeFile(filePath, updated, 'utf8');
}
export async function updateItemStatus(workspaceRoot, slug, itemId, options) {
    const filePath = slugToPath(workspaceRoot, slug);
    await writeItemStatusToFile(storage, filePath, itemId, options);
}
/**
 * Approve meeting and run post-approval automation.
 *
 * Post-approval steps:
 * 1. Commit approved items to memory (decisions, learnings)
 * 2. Refresh QMD index
 * 3. Refresh person memory for each attendee (syncs commitments)
 */
export async function approveMeeting(workspaceRoot, slug) {
    const filePath = slugToPath(workspaceRoot, slug);
    const memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
    // Step 1: Commit approved items
    await commitApprovedItems(storage, filePath, memoryDir);
    // Get meeting to extract attendee_ids
    const meeting = await getMeeting(workspaceRoot, slug);
    if (!meeting)
        throw new Error(`Meeting not found after approve: ${slug}`);
    // Step 2: Refresh QMD index
    const config = await loadConfig(storage, workspaceRoot);
    let qmdRefreshed = false;
    try {
        await refreshQmdIndex(workspaceRoot, config.qmd_collection);
        qmdRefreshed = true;
    }
    catch (err) {
        // Non-fatal — log but continue
        console.error('[approveMeeting] QMD refresh failed:', err);
    }
    // Step 3: Refresh person memory for attendees (syncs commitments)
    const personMemoryRefreshed = [];
    // Extract attendee_ids from frontmatter (array of person slugs)
    const attendeeIds = Array.isArray(meeting.frontmatter['attendee_ids'])
        ? meeting.frontmatter['attendee_ids'].filter((id) => typeof id === 'string')
        : [];
    if (attendeeIds.length > 0) {
        try {
            const services = await createServices(workspaceRoot);
            const paths = services.workspace.getPaths(workspaceRoot);
            for (const personSlug of attendeeIds) {
                try {
                    await services.entity.refreshPersonMemory(paths, {
                        personSlug,
                        commitments: services.commitments,
                    });
                    personMemoryRefreshed.push(personSlug);
                }
                catch (err) {
                    // Non-fatal per person — log and continue
                    console.error(`[approveMeeting] Person memory refresh failed for ${personSlug}:`, err);
                }
            }
        }
        catch (err) {
            // Non-fatal — log but continue
            console.error('[approveMeeting] Services creation failed:', err);
        }
    }
    return {
        ...meeting,
        automation: {
            qmdRefreshed,
            personMemoryRefreshed,
            commitmentsUpdated: personMemoryRefreshed.length > 0,
        },
    };
}
