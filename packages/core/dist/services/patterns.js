/**
 * Pattern detection service — finds recurring topics across meetings and people.
 *
 * detectCrossPersonPatterns() reads meeting files in the last N days, extracts
 * topics from their content, and returns topics mentioned in 2+ meetings
 * across 2+ distinct attendees.
 */
import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { extractAttendeeSlugs } from '../utils/attendees.js';
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return { data: {}, body: content };
    try {
        return {
            data: parseYaml(match[1]),
            body: match[2],
        };
    }
    catch {
        return { data: {}, body: content };
    }
}
/**
 * Extract topics from meeting body content.
 *
 * Looks at:
 * 1. Bullet points in "## Key Points" section
 * 2. First sentence(s) of "## Summary" section
 * 3. Lines starting with "- " or "* " in the first 2000 chars
 *
 * Returns normalized, deduplicated topic strings.
 */
function extractTopicsFromContent(body) {
    const topics = [];
    const seen = new Set();
    // Section-level extraction helper
    function extractSection(header) {
        const m = body.match(header);
        if (!m)
            return '';
        const afterHeader = body.slice(m.index + m[0].length);
        // Take until next ## heading
        const nextSection = afterHeader.search(/\n## /);
        return nextSection >= 0 ? afterHeader.slice(0, nextSection) : afterHeader.slice(0, 1500);
    }
    function addTopic(raw) {
        // Strip markdown formatting, task markers, and IDs
        const cleaned = raw
            .replace(/^\s*[-*•]\s*/, '')
            .replace(/^\s*\[[ x]\]\s*/i, '')
            .replace(/^[a-z]{2}_\d{3}:\s*/i, '') // Strip staged item IDs like ai_001:
            .replace(/[*_`]/g, '')
            .trim();
        if (cleaned.length < 5 || cleaned.length > 120)
            return;
        const normalized = cleaned.toLowerCase();
        if (seen.has(normalized))
            return;
        seen.add(normalized);
        topics.push(cleaned);
    }
    // 1. Key Points section
    const keyPoints = extractSection(/^## Key Points\s*$/m);
    for (const line of keyPoints.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            addTopic(trimmed);
        }
    }
    // 2. Lead-prose section — first 3 sentences. Accept either ## Summary
    // (legacy / light extraction) or ## Core (wiki-aware shape, Task 8); both
    // are permanent per Decision #7.
    const summary = extractSection(/^##\s+(?:Summary|Core)\s*$/m);
    if (summary.trim()) {
        // Split on sentence-ending punctuation and take first 3 non-empty sentences
        const sentences = summary
            .replace(/\n+/g, ' ')
            .split(/(?<=[.!?])\s+/)
            .slice(0, 3);
        for (const s of sentences) {
            addTopic(s);
        }
    }
    // 3. General bullet points in first 2000 chars (if still few topics)
    if (topics.length < 3) {
        const sample = body.slice(0, 2000);
        for (const line of sample.split('\n')) {
            const trimmed = line.trim();
            if ((trimmed.startsWith('- ') || trimmed.startsWith('* ')) && trimmed.length > 6) {
                addTopic(trimmed);
            }
        }
    }
    return topics.slice(0, 20); // cap per meeting
}
/**
 * Normalize a topic for grouping comparison.
 * Lowercase, strip punctuation, collapse whitespace.
 */
function normalizeTopic(topic) {
    return topic
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Parse a date string (YYYY-MM-DD or ISO) into a Date.
 * Returns null if invalid.
 */
function parseDate(s) {
    if (typeof s !== 'string')
        return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Detect cross-person patterns in recent meetings.
 *
 * Reads meeting files from the last `days` days, extracts topics, and returns
 * patterns that appear in 2+ meetings across 2+ distinct attendees.
 *
 * @param meetingsDirPath - Absolute path to the meetings directory
 * @param storage - StorageAdapter for file access
 * @param options - { days: 30 } lookback window
 */
export async function detectCrossPersonPatterns(meetingsDirPath, storage, options = {}) {
    const lookbackDays = options.days ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    // List all .md files in meetings dir
    const allFiles = await storage.list(meetingsDirPath, { extensions: ['.md'] });
    if (allFiles.length === 0)
        return [];
    const topicMap = new Map();
    for (const filePath of allFiles) {
        const content = await storage.read(filePath);
        if (!content)
            continue;
        const { data, body } = parseFrontmatter(content);
        // Filter by date
        const meetingDate = parseDate(data['date']);
        if (!meetingDate || meetingDate < cutoff)
            continue;
        const slug = basename(filePath, '.md');
        const dateStr = typeof data['date'] === 'string' ? data['date'] : meetingDate.toISOString().slice(0, 10);
        const attendees = extractAttendeeSlugs(data);
        const topics = extractTopicsFromContent(body);
        for (const topic of topics) {
            const key = normalizeTopic(topic);
            if (!key)
                continue;
            let accum = topicMap.get(key);
            if (!accum) {
                accum = { topic, meetings: new Set(), people: new Set(), lastDate: dateStr };
                topicMap.set(key, accum);
            }
            accum.meetings.add(slug);
            for (const person of attendees) {
                if (person)
                    accum.people.add(person);
            }
            // Keep most recent date
            if (dateStr > accum.lastDate) {
                accum.lastDate = dateStr;
                accum.topic = topic; // Use the most recent version of the topic text
            }
        }
    }
    // Filter: 2+ mentions (meetings) AND 2+ distinct people
    const patterns = [];
    for (const [, accum] of topicMap) {
        if (accum.meetings.size >= 2 && accum.people.size >= 2) {
            patterns.push({
                topic: accum.topic,
                mentions: accum.meetings.size,
                people: [...accum.people].sort(),
                meetings: [...accum.meetings].sort(),
                lastSeen: accum.lastDate,
            });
        }
    }
    // Sort by mentions descending, then by lastSeen descending
    patterns.sort((a, b) => {
        if (b.mentions !== a.mentions)
            return b.mentions - a.mentions;
        return b.lastSeen.localeCompare(a.lastSeen);
    });
    return patterns;
}
//# sourceMappingURL=patterns.js.map