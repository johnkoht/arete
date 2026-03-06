/**
 * Meeting save logic — uses StorageAdapter, no direct fs.
 */
import { join } from 'path';
import { stringify as stringifyYaml } from 'yaml';
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
export function meetingFilename(meeting) {
    let dateStr = meeting.date;
    if (dateStr?.includes('T'))
        dateStr = dateStr.slice(0, 10);
    if (!dateStr)
        dateStr = new Date().toISOString().slice(0, 10);
    const titleSlug = slugify(meeting.title || 'untitled');
    return `${dateStr}-${titleSlug}.md`;
}
/**
 * Build the attendees YAML block.
 * Each attendee becomes `{ name: string, email: string }`.
 * Null/undefined values become empty string.
 */
function buildAttendeesYaml(attendees) {
    return attendees.map((a) => {
        if (typeof a === 'string') {
            return { name: a, email: '' };
        }
        return {
            name: a.name ?? '',
            email: a.email ?? '',
        };
    });
}
export async function saveMeetingFile(storage, meeting, outputDir, templateContent, options = {}) {
    const { integration = 'Manual', force = false } = options;
    const filename = meetingFilename(meeting);
    const fullPath = join(outputDir, filename);
    const exists = await storage.exists(fullPath);
    if (!force && exists)
        return null;
    const vars = {
        title: meeting.title,
        date: meeting.date,
        duration: `${meeting.duration_minutes} minutes`,
        integration,
        import_date: new Date().toISOString().slice(0, 10),
        attendees: (meeting.attendees ?? [])
            .map((a) => a && typeof a === 'object' ? (a.name ?? a.email ?? String(a)) : String(a))
            .join(', '),
        summary: meeting.summary || 'No summary available.',
        key_points: (meeting.highlights ?? [])
            .map((h) => `- ${h}`)
            .join('\n') || 'No key points captured.',
        action_items: (meeting.action_items ?? [])
            .map((a) => `- [ ] ${a}`)
            .join('\n') || 'No action items captured.',
        transcript: meeting.transcript || 'No transcript available.',
        meeting_id: String(meeting.recording_id ?? meeting.id ?? ''),
        recording_link: meeting.url ?? '',
        source_link: meeting.url ?? meeting.share_url ?? '',
    };
    let content = templateContent;
    for (const [k, v] of Object.entries(vars)) {
        content = content.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    // Build frontmatter data object
    const frontmatterData = {
        title: meeting.title,
        date: meeting.date,
        source: integration,
        status: meeting.status ?? 'synced',
    };
    // Write structured attendees array
    const rawAttendees = meeting.attendees ?? [];
    frontmatterData['attendees'] = buildAttendeesYaml(rawAttendees);
    // Serialize using yaml.stringify for round-trip safety
    const frontmatterStr = stringifyYaml(frontmatterData).trimEnd();
    const fullContent = `---\n${frontmatterStr}\n---\n\n${content}`;
    await storage.mkdir(outputDir);
    await storage.write(fullPath, fullContent);
    return fullPath;
}
const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

## Transcript
{transcript}
`;
//# sourceMappingURL=meetings.js.map