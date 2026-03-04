/**
 * Person memory signal collection, aggregation, rendering, and upsert.
 *
 * Extracted from entity.ts to keep the EntityService focused on entity
 * resolution while person-memory concerns live in their own module.
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const AUTO_PERSON_MEMORY_START = '<!-- AUTO_PERSON_MEMORY:START -->';
export const AUTO_PERSON_MEMORY_END = '<!-- AUTO_PERSON_MEMORY:END -->';
/**
 * Regex to extract the 8-char hash prefix from a commitment line's HTML comment.
 * Matches `<!-- h:3f9a1b2c -->` and captures `3f9a1b2c`.
 */
export const HASH_COMMENT_RE = /<!--\s*h:([0-9a-f]{8})\s*-->/;
// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
/**
 * Normalize a signal topic string for deduplication and aggregation.
 * Lowercases, strips punctuation, collapses whitespace, and truncates to 120 chars.
 */
export function normalizeSignalTopic(topic) {
    return topic
        .toLowerCase()
        .replace(/^[\s:;,.!?-]+/, '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .slice(0, 120);
}
/**
 * Extract ask/concern signals for a person from meeting content.
 * Uses regex patterns to detect phrases like "asked about", "concerned about",
 * and speaker-attributed dialogue.
 *
 * @param content - Meeting transcript or notes text
 * @param personName - Name of the person to extract signals for
 * @param date - Meeting date (YYYY-MM-DD)
 * @param source - Meeting filename for provenance tracking
 */
export function collectSignalsForPerson(content, personName, date, source) {
    const signals = [];
    const lines = content.split('\n');
    const personLower = personName.toLowerCase();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const lower = trimmed.toLowerCase();
        const mentionsPerson = lower.includes(personLower);
        if (!mentionsPerson)
            continue;
        const askMatch = trimmed.match(/\basked\s+(?:about|for|if)\s+(.+?)(?:[.?!]|$)/i);
        if (askMatch) {
            const topic = normalizeSignalTopic(askMatch[1]);
            if (topic.length > 2) {
                signals.push({ kind: 'ask', topic, date, source });
            }
        }
        const concernMatch = trimmed.match(/\b(?:concerned about|worried about|skeptical about|pushed back on)\s+(.+?)(?:[.?!]|$)/i);
        if (concernMatch) {
            const topic = normalizeSignalTopic(concernMatch[1]);
            if (topic.length > 2) {
                signals.push({ kind: 'concern', topic, date, source });
            }
        }
        const speakerMatch = trimmed.match(/^([^:]{2,80}):\s+(.+)$/);
        if (speakerMatch) {
            const speaker = speakerMatch[1].trim().toLowerCase();
            const speech = speakerMatch[2].trim();
            const speechLower = speech.toLowerCase();
            if (!speaker.includes(personLower))
                continue;
            const speakerAskMatch = speech.match(/\b(?:can we|could we|what about|how about)\s+(.+?)(?:[.?!]|$)/i);
            if (speakerAskMatch) {
                const topic = normalizeSignalTopic(speakerAskMatch[1]);
                if (topic.length > 2) {
                    signals.push({ kind: 'ask', topic, date, source });
                }
            }
            if (speechLower.includes('concerned about') || speechLower.includes('worried about')) {
                const topic = normalizeSignalTopic(speech
                    .replace(/.*\b(?:concerned about|worried about)\b/i, '')
                    .replace(/[.?!].*$/, ''));
                if (topic.length > 2) {
                    signals.push({ kind: 'concern', topic, date, source });
                }
            }
        }
    }
    return signals;
}
/**
 * Aggregate raw signals by topic, counting occurrences and tracking sources.
 * Filters out topics below the minimum mention threshold.
 *
 * @param signals - Raw signals from collectSignalsForPerson
 * @param minMentions - Minimum mention count to include a topic
 */
export function aggregateSignals(signals, minMentions) {
    const asksByTopic = new Map();
    const concernsByTopic = new Map();
    for (const signal of signals) {
        const targetMap = signal.kind === 'ask' ? asksByTopic : concernsByTopic;
        const existing = targetMap.get(signal.topic);
        if (!existing) {
            targetMap.set(signal.topic, {
                topic: signal.topic,
                count: 1,
                lastMentioned: signal.date,
                sources: [signal.source],
            });
            continue;
        }
        existing.count += 1;
        if (signal.date > existing.lastMentioned) {
            existing.lastMentioned = signal.date;
        }
        if (!existing.sources.includes(signal.source)) {
            existing.sources.push(signal.source);
        }
    }
    const toSorted = (m) => [...m.values()]
        .filter((item) => item.count >= minMentions)
        .sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        return b.lastMentioned.localeCompare(a.lastMentioned);
    });
    return {
        asks: toSorted(asksByTopic),
        concerns: toSorted(concernsByTopic),
    };
}
/**
 * Extract all 8-char hash prefixes from `<!-- h:XXXXXXXX -->` comments in text.
 * Scans the entire file content (not just the auto-section) so that deleted
 * lines are correctly detected as absent.
 */
export function extractHashesFromContent(content) {
    const hashes = new Set();
    for (const line of content.split('\n')) {
        const match = HASH_COMMENT_RE.exec(line);
        if (match)
            hashes.add(match[1]);
    }
    return hashes;
}
/**
 * Extract hash prefixes from checked (`- [x]`) commitment lines.
 * A line must match `- [x]` AND contain a `<!-- h:XXXXXXXX -->` comment to be
 * treated as a checked commitment (the hash uniquely identifies it as machine-generated).
 */
export function extractCheckedHashes(content) {
    const checked = [];
    for (const line of content.split('\n')) {
        if (/^- \[x\]/i.test(line.trim())) {
            const match = HASH_COMMENT_RE.exec(line);
            if (match)
                checked.push(match[1]);
        }
    }
    return checked;
}
/**
 * Render the auto-generated person memory section as markdown.
 * Includes repeated asks, concerns, stances, action items, and relationship health.
 * Output is wrapped in AUTO_PERSON_MEMORY sentinel comments for upsert.
 */
export function renderPersonMemorySection(asks, concerns, options) {
    const today = new Date().toISOString().slice(0, 10);
    const lines = [
        AUTO_PERSON_MEMORY_START,
        '## Memory Highlights (Auto)',
        '',
        '> Auto-generated from meeting notes/transcripts. Do not edit manually.',
        '',
        `Last refreshed: ${today}`,
        '',
        '### Repeated asks',
    ];
    if (asks.length === 0) {
        lines.push('- None detected yet.');
    }
    else {
        for (const item of asks.slice(0, 8)) {
            lines.push(`- **${item.topic}** — mentioned ${item.count} times (last: ${item.lastMentioned}; sources: ${item.sources.slice(0, 3).join(', ')})`);
        }
    }
    lines.push('', '### Repeated concerns');
    if (concerns.length === 0) {
        lines.push('- None detected yet.');
    }
    else {
        for (const item of concerns.slice(0, 8)) {
            lines.push(`- **${item.topic}** — mentioned ${item.count} times (last: ${item.lastMentioned}; sources: ${item.sources.slice(0, 3).join(', ')})`);
        }
    }
    // Stances
    const stances = options?.stances ?? [];
    lines.push('', '### Stances');
    if (stances.length === 0) {
        lines.push('- None detected yet.');
    }
    else {
        for (const stance of stances) {
            lines.push(`- **${stance.topic}** — ${stance.direction}: ${stance.summary} (from: ${stance.source}, ${stance.date})`);
        }
    }
    if (options?.commitments !== undefined) {
        // CommitmentsService mode: render interactive checkboxes with embedded hash comments.
        // Only show sections that have items; omit both sections when list is empty.
        const iOweThem = options.commitments.filter((c) => c.direction === 'i_owe_them');
        const theyOweMe = options.commitments.filter((c) => c.direction === 'they_owe_me');
        if (iOweThem.length > 0) {
            lines.push('', '### Open Commitments (I owe them)');
            for (const c of iOweThem) {
                lines.push(`- [ ] ${c.text} (${c.date}) <!-- h:${c.id.slice(0, 8)} -->`);
            }
        }
        if (theyOweMe.length > 0) {
            lines.push('', '### Open Commitments (They owe me)');
            for (const c of theyOweMe) {
                lines.push(`- [ ] ${c.text} (${c.date}) <!-- h:${c.id.slice(0, 8)} -->`);
            }
        }
    }
    else {
        // Plain-text action items (existing behavior — no regression when commitments not provided).
        const actionItems = options?.actionItems ?? [];
        const iOweThem = actionItems.filter((i) => i.direction === 'i_owe_them');
        const theyOweMe = actionItems.filter((i) => i.direction === 'they_owe_me');
        lines.push('', '### Open Items (I owe them)');
        if (iOweThem.length === 0) {
            lines.push('- None detected yet.');
        }
        else {
            for (const item of iOweThem) {
                lines.push(`- ${item.text} (from: ${item.source}, ${item.date})`);
            }
        }
        lines.push('', '### Open Items (They owe me)');
        if (theyOweMe.length === 0) {
            lines.push('- None detected yet.');
        }
        else {
            for (const item of theyOweMe) {
                lines.push(`- ${item.text} (from: ${item.source}, ${item.date})`);
            }
        }
    }
    // Relationship Health
    const health = options?.health;
    lines.push('', '### Relationship Health');
    if (!health) {
        lines.push('- None detected yet.');
    }
    else {
        const lastMetStr = health.lastMet
            ? `${health.lastMet} (${health.daysSinceLastMet} days ago)`
            : 'Never';
        const statusMap = {
            active: 'Active',
            regular: 'Regular',
            cooling: 'Cooling',
            dormant: 'Dormant',
        };
        lines.push(`- Last met: ${lastMetStr}`);
        lines.push(`- Meetings: ${health.meetingsLast30Days} in last 30d, ${health.meetingsLast90Days} in last 90d`);
        lines.push(`- Open loops: ${health.openLoopCount}`);
        lines.push(`- Status: ${statusMap[health.indicator] ?? health.indicator}`);
    }
    lines.push('', AUTO_PERSON_MEMORY_END, '');
    return lines.join('\n');
}
/**
 * Extract the auto-generated memory section from a person file's content.
 * Returns null if no section is found or if it's empty.
 */
export function extractPersonMemorySection(content) {
    const startIndex = content.indexOf(AUTO_PERSON_MEMORY_START);
    const endIndex = content.indexOf(AUTO_PERSON_MEMORY_END);
    if (startIndex < 0 || endIndex <= startIndex)
        return null;
    const start = startIndex + AUTO_PERSON_MEMORY_START.length;
    const section = content.slice(start, endIndex).trim();
    return section.length > 0 ? section : null;
}
/**
 * Parse the "Last refreshed" date from an existing person memory section.
 * Returns the YYYY-MM-DD string or null if not found.
 */
export function getPersonMemoryLastRefreshed(content) {
    const section = extractPersonMemorySection(content);
    if (!section)
        return null;
    const match = section.match(/Last refreshed:\s*(\d{4}-\d{2}-\d{2})/i);
    return match ? match[1] : null;
}
/**
 * Check if a person's memory section is stale and needs refreshing.
 * Returns true if lastRefreshed is null, invalid, or older than ifStaleDays.
 * Always returns true when ifStaleDays is undefined or <= 0 (i.e., always refresh).
 */
export function isMemoryStale(lastRefreshed, ifStaleDays) {
    if (!ifStaleDays || ifStaleDays <= 0)
        return true;
    if (!lastRefreshed)
        return true;
    const refreshedAt = new Date(lastRefreshed);
    if (Number.isNaN(refreshedAt.getTime()))
        return true;
    const now = new Date();
    const diffMs = now.getTime() - refreshedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= ifStaleDays;
}
/**
 * Insert or replace the auto-generated memory section in a person file.
 * If sentinel comments exist, replaces the content between them.
 * Otherwise, appends the section at the end of the file.
 */
export function upsertPersonMemorySection(content, section) {
    const startIndex = content.indexOf(AUTO_PERSON_MEMORY_START);
    const endIndex = content.indexOf(AUTO_PERSON_MEMORY_END);
    if (startIndex >= 0 && endIndex > startIndex) {
        const before = content.slice(0, startIndex).trimEnd();
        const after = content.slice(endIndex + AUTO_PERSON_MEMORY_END.length).trimStart();
        const joined = `${before}\n\n${section.trim()}\n\n${after}`.trimEnd();
        return joined + '\n';
    }
    const trimmed = content.trimEnd();
    return `${trimmed}\n\n${section.trim()}\n`;
}
//# sourceMappingURL=person-memory.js.map