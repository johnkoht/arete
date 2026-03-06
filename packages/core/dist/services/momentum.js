/**
 * Momentum service — commitment and relationship momentum analysis.
 *
 * computeCommitmentMomentum(): buckets open commitments into hot/stale/critical
 * computeRelationshipMomentum(): scans meeting attendees to classify relationships
 */
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { extractAttendeeSlugs } from '../utils/attendees.js';
/**
 * Bucket open commitments by how long they've been open.
 *
 * Hot:      < 7 days old (recently created, still in motion)
 * Stale:    7–30 days old (drifting, needs attention)
 * Critical: > 30 days old (seriously overdue)
 *
 * Age is measured from the commitment's `date` field.
 */
export function computeCommitmentMomentum(commitments, referenceDate = new Date()) {
    const result = { hot: [], stale: [], critical: [] };
    for (const c of commitments) {
        if (c.status !== 'open')
            continue;
        const itemDate = new Date(c.date);
        if (Number.isNaN(itemDate.getTime())) {
            // Can't determine age — treat as stale
            result.stale.push({ commitment: c, bucket: 'stale', ageDays: -1 });
            continue;
        }
        const ageDays = (referenceDate.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 30) {
            result.critical.push({ commitment: c, bucket: 'critical', ageDays: Math.floor(ageDays) });
        }
        else if (ageDays > 7) {
            result.stale.push({ commitment: c, bucket: 'stale', ageDays: Math.floor(ageDays) });
        }
        else {
            result.hot.push({ commitment: c, bucket: 'hot', ageDays: Math.floor(ageDays) });
        }
    }
    // Sort each bucket by age descending (oldest first within bucket)
    const byAge = (a, b) => b.ageDays - a.ageDays;
    result.hot.sort(byAge);
    result.stale.sort(byAge);
    result.critical.sort(byAge);
    return result;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match)
        return { data: {} };
    try {
        return { data: parseYaml(match[1]) };
    }
    catch {
        return { data: {} };
    }
}
/**
 * Try to resolve a person's display name from their profile file.
 * Falls back to the slug if the file doesn't exist or can't be parsed.
 */
async function resolvePersonName(personSlug, peopleDir, storage) {
    const categories = ['internal', 'customers', 'users'];
    for (const cat of categories) {
        const filePath = join(peopleDir, cat, `${personSlug}.md`);
        const content = await storage.read(filePath);
        if (!content)
            continue;
        // Extract name from frontmatter or first heading
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fmMatch) {
            try {
                const data = parseYaml(fmMatch[1]);
                const name = data['name'] ?? data['full_name'];
                if (typeof name === 'string' && name.trim())
                    return name.trim();
            }
            catch { /* ignore */ }
        }
        // Try first # Heading
        const headingMatch = content.match(/^# (.+)/m);
        if (headingMatch)
            return headingMatch[1].trim();
    }
    // Fall back: convert slug to title case
    return personSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Compute relationship momentum by scanning meeting attendees.
 *
 * Reads all .md files in meetingsDirPath, collects attendee slugs per meeting,
 * and classifies each known person by their last meeting date.
 *
 * @param meetingsDirPath - Absolute path to resources/meetings/
 * @param peopleDir - Absolute path to people/ directory
 * @param storage - StorageAdapter
 * @param options - { days: 90 } lookback for "known" relationships; { personSlug } to filter
 */
export async function computeRelationshipMomentum(meetingsDirPath, peopleDir, storage, options = {}) {
    const lookbackDays = options.days ?? 90;
    const referenceDate = options.referenceDate ?? new Date();
    const cutoff = new Date(referenceDate);
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const result = { active: [], cooling: [], stale: [] };
    const personMap = new Map();
    const allFiles = await storage.list(meetingsDirPath, { extensions: ['.md'] });
    for (const filePath of allFiles) {
        const content = await storage.read(filePath);
        if (!content)
            continue;
        const { data } = parseFrontmatter(content);
        const dateRaw = data['date'];
        if (typeof dateRaw !== 'string')
            continue;
        const meetingDate = new Date(dateRaw);
        if (Number.isNaN(meetingDate.getTime()))
            continue;
        // Only consider meetings within lookback window
        if (meetingDate < cutoff)
            continue;
        const dateStr = dateRaw.includes('T') ? dateRaw.slice(0, 10) : dateRaw;
        const attendees = extractAttendeeSlugs(data);
        for (const slug of attendees) {
            if (!slug)
                continue;
            if (options.personSlug && slug !== options.personSlug)
                continue;
            const track = personMap.get(slug);
            if (!track) {
                personMap.set(slug, { lastDate: dateStr, count: 1 });
            }
            else {
                track.count++;
                if (dateStr > track.lastDate)
                    track.lastDate = dateStr;
            }
        }
    }
    if (personMap.size === 0)
        return result;
    // Build momentum items
    for (const [slug, track] of personMap) {
        const lastDate = new Date(track.lastDate);
        const daysSince = (referenceDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        const days = Math.floor(daysSince);
        const personName = await resolvePersonName(slug, peopleDir, storage);
        const item = {
            personSlug: slug,
            personName,
            lastMeetingDate: track.lastDate,
            daysSinceMeeting: days,
            bucket: days <= 14 ? 'active' : days <= 30 ? 'cooling' : 'stale',
            meetingCount: track.count,
        };
        result[item.bucket].push(item);
    }
    // Sort each bucket by lastMeetingDate descending (most recent first)
    const byDate = (a, b) => b.lastMeetingDate.localeCompare(a.lastMeetingDate);
    result.active.sort(byDate);
    result.cooling.sort(byDate);
    result.stale.sort(byDate);
    return result;
}
//# sourceMappingURL=momentum.js.map