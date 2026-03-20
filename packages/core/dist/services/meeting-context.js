/**
 * Meeting context service — assembles context bundles for meeting files.
 *
 * Provides a single function `buildMeetingContext(meetingPath, options)` that:
 * 1. Reads meeting file (title, date, attendees, transcript)
 * 2. Finds linked agenda (via frontmatter or fuzzy match)
 * 3. Resolves attendees to person profiles with stances/openItems
 * 4. Gathers related workspace context via brief service
 *
 * Used by `arete meeting context <file>` CLI command.
 */
import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { parseAgendaItems, getUncheckedAgendaItems } from '../utils/agenda.js';
import { findMatchingAgenda } from '../integrations/meetings.js';
import { slugifyPersonName } from './entity.js';
/**
 * Parse meeting file frontmatter and body.
 */
function parseMeetingFile(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match)
        return null;
    try {
        const fm = parseYaml(match[1]);
        const body = match[2];
        // Parse title
        const title = typeof fm.title === 'string' ? fm.title : '';
        // Parse date (handle ISO with time)
        let date = '';
        if (typeof fm.date === 'string') {
            // Extract YYYY-MM-DD portion
            const dateMatch = fm.date.match(/^(\d{4}-\d{2}-\d{2})/);
            date = dateMatch ? dateMatch[1] : fm.date;
        }
        // Parse attendees (array of { name, email } or strings)
        const attendees = [];
        if (Array.isArray(fm.attendees)) {
            for (const a of fm.attendees) {
                if (typeof a === 'string') {
                    // Try to parse "Name <email>" format
                    const angleMatch = a.match(/^(.+?)\s*<([^>]+)>$/);
                    if (angleMatch) {
                        attendees.push({ name: angleMatch[1].trim(), email: angleMatch[2].trim() });
                    }
                    else if (a.includes('@')) {
                        // Just an email
                        attendees.push({ name: a.split('@')[0].replace(/[._-]/g, ' '), email: a });
                    }
                    else {
                        attendees.push({ name: a, email: '' });
                    }
                }
                else if (typeof a === 'object' && a !== null) {
                    const obj = a;
                    attendees.push({
                        name: typeof obj.name === 'string' ? obj.name : '',
                        email: typeof obj.email === 'string' ? obj.email : '',
                    });
                }
            }
        }
        // Parse agenda path if present
        const agenda = typeof fm.agenda === 'string' ? fm.agenda : undefined;
        return {
            frontmatter: { title, date, attendees, agenda },
            body,
        };
    }
    catch {
        return null;
    }
}
/**
 * Extract transcript from meeting body.
 * Looks for ## Transcript section or uses the entire body.
 */
function extractTranscript(body) {
    // Try to find a dedicated Transcript section
    const transcriptMatch = body.match(/^## Transcript\s*\n([\s\S]*?)(?=^## |\Z)/m);
    if (transcriptMatch) {
        return transcriptMatch[1].trim();
    }
    // Otherwise return the full body (minus frontmatter-only files)
    return body.trim();
}
/**
 * Parse person file to extract profile summary, stances, and open items.
 */
async function parsePersonFile(storage, personPath) {
    const content = await storage.read(personPath);
    if (!content)
        return null;
    const stances = [];
    const openItems = [];
    let profile = '';
    const lines = content.split('\n');
    let currentSection = '';
    let profileLines = [];
    let inAutoSection = false;
    let inFrontmatter = false;
    let frontmatterCount = 0;
    for (const line of lines) {
        // Track frontmatter boundaries
        if (line.startsWith('---')) {
            frontmatterCount++;
            if (frontmatterCount === 1) {
                inFrontmatter = true;
            }
            else if (frontmatterCount === 2) {
                inFrontmatter = false;
            }
            continue;
        }
        // Skip content inside frontmatter
        if (inFrontmatter)
            continue;
        // Track auto-generated section
        if (line.includes('<!-- AUTO_PERSON_MEMORY:START -->')) {
            inAutoSection = true;
            continue;
        }
        if (line.includes('<!-- AUTO_PERSON_MEMORY:END -->')) {
            inAutoSection = false;
            continue;
        }
        // Track sections
        const sectionMatch = line.match(/^###?\s+(.+)$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim().toLowerCase();
            continue;
        }
        // Extract stances
        if (currentSection === 'stances' && line.startsWith('- ') && !line.includes('None detected')) {
            stances.push(line.replace(/^- /, '').trim());
        }
        // Extract open items (both I owe them and they owe me)
        if ((currentSection.includes('open items') || currentSection.includes('open commitments')) &&
            line.startsWith('- ') &&
            !line.includes('None detected')) {
            // Strip checkbox syntax and hash comments
            const cleanedItem = line
                .replace(/^- \[[x ]\]\s*/i, '- ')
                .replace(/<!--.*?-->/g, '')
                .replace(/^- /, '')
                .trim();
            if (cleanedItem) {
                openItems.push(cleanedItem);
            }
        }
        // Build profile from non-section content (first paragraph after frontmatter)
        if (!inAutoSection && !currentSection && !line.startsWith('#') && line.trim()) {
            profileLines.push(line.trim());
        }
    }
    // Use first few lines as profile summary
    profile = profileLines.slice(0, 3).join(' ').slice(0, 500);
    return { profile, stances, openItems };
}
/**
 * Find recent meetings for a person by scanning meeting files.
 */
async function findRecentMeetings(storage, paths, personSlug, personEmail, limit = 5) {
    const meetingsDir = join(paths.resources, 'meetings');
    if (!(await storage.exists(meetingsDir)))
        return [];
    const files = await storage.list(meetingsDir, { extensions: ['.md'] });
    const meetingTitles = [];
    for (const file of files) {
        if (file.endsWith('index.md'))
            continue;
        const content = await storage.read(file);
        if (!content)
            continue;
        const parsed = parseMeetingFile(content);
        if (!parsed)
            continue;
        // Check if person is an attendee
        const isAttendee = parsed.frontmatter.attendees.some((a) => a.email.toLowerCase() === personEmail.toLowerCase() ||
            slugifyPersonName(a.name) === personSlug);
        // Also check attendee_ids in frontmatter
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fmMatch) {
            try {
                const fm = parseYaml(fmMatch[1]);
                if (Array.isArray(fm.attendee_ids)) {
                    const hasSlug = fm.attendee_ids.some((id) => typeof id === 'string' && id === personSlug);
                    if (hasSlug && !isAttendee) {
                        meetingTitles.push({ date: parsed.frontmatter.date, title: parsed.frontmatter.title });
                        continue;
                    }
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        if (isAttendee) {
            meetingTitles.push({ date: parsed.frontmatter.date, title: parsed.frontmatter.title });
        }
    }
    // Sort by date descending and return titles
    return meetingTitles
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((m) => m.title);
}
/**
 * Resolve a single attendee to their person profile.
 */
async function resolveAttendee(storage, entity, paths, attendee) {
    // Try resolution by email first, then by name
    const resolved = await entity.resolveAll(attendee.email || attendee.name, 'person', paths, 1);
    if (resolved.length === 0)
        return null;
    const person = resolved[0];
    const personPath = person.path;
    // Generate slug from name if not present (slug is optional in ResolvedEntity)
    const personSlug = person.slug ?? slugifyPersonName(person.name);
    const personEmail = attendee.email || person.metadata.email || '';
    // Parse person file for profile details
    const personDetails = await parsePersonFile(storage, personPath);
    // Find recent meetings
    const recentMeetings = await findRecentMeetings(storage, paths, personSlug, personEmail);
    return {
        slug: personSlug,
        email: personEmail,
        name: person.name,
        category: person.metadata.category || 'unknown',
        profile: personDetails?.profile || '',
        stances: personDetails?.stances || [],
        openItems: personDetails?.openItems || [],
        recentMeetings,
    };
}
/**
 * Extract related context from brief service response.
 */
function extractRelatedContext(briefingText) {
    const result = {
        goals: [],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
    };
    const lines = briefingText.split('\n');
    let currentSection = '';
    for (const line of lines) {
        const sectionMatch = line.match(/^###\s+(.+)$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim().toLowerCase();
            continue;
        }
        if (!line.startsWith('- '))
            continue;
        const item = line.replace(/^- /, '').trim();
        if (currentSection === 'goal' || currentSection === 'goals') {
            // Parse: **Goal**: title — Source: `path` (relevance: N.NN)
            const goalMatch = item.match(/\*\*Goal\*\*:\s*(.+?)\s*—\s*Source:\s*`([^`]+)`/);
            if (goalMatch) {
                const pathParts = goalMatch[2].split('/');
                const slug = pathParts[pathParts.length - 1]?.replace(/\.md$/, '') || '';
                result.goals.push({
                    slug,
                    title: goalMatch[1].trim(),
                    summary: goalMatch[1].trim(),
                });
            }
        }
        if (currentSection === 'project' || currentSection === 'projects') {
            // Parse: summary — Source: `path`
            const projectMatch = item.match(/(.+?)\s*—\s*Source:\s*`([^`]+)`/);
            if (projectMatch) {
                const pathParts = projectMatch[2].split('/');
                const slug = pathParts[pathParts.length - 1]?.replace(/\.md$/, '')?.replace('/README', '') || '';
                result.projects.push({
                    slug,
                    title: projectMatch[1].trim(),
                    summary: projectMatch[1].trim(),
                });
            }
        }
        if (currentSection === 'relevant memory') {
            // Parse: **Decision**: [date] title — Source: `path`
            // Parse: **Learning**: [date] title — Source: `path`
            const decisionMatch = item.match(/\*\*Decision\*\*:\s*(?:\[[\d-]+\]\s*)?(.+?)\s*—/);
            if (decisionMatch) {
                result.recentDecisions.push(decisionMatch[1].trim());
            }
            const learningMatch = item.match(/\*\*Learning\*\*:\s*(?:\[[\d-]+\]\s*)?(.+?)\s*—/);
            if (learningMatch) {
                result.recentLearnings.push(learningMatch[1].trim());
            }
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------
/**
 * Build a complete context bundle for a meeting file.
 *
 * @param meetingPath - Absolute or relative path to the meeting file
 * @param deps - Dependencies (storage, intelligence, entity, paths)
 * @param options - Optional flags to skip agenda or people resolution
 * @returns MeetingContextBundle with all assembled context
 */
export async function buildMeetingContext(meetingPath, deps, options = {}) {
    const { storage, intelligence, entity, paths } = deps;
    const warnings = [];
    // Resolve path
    const absPath = meetingPath.startsWith('/')
        ? meetingPath
        : resolve(paths.root, meetingPath);
    // 1. Read and parse meeting file
    const content = await storage.read(absPath);
    if (!content) {
        throw new Error(`Meeting file not found: ${meetingPath}`);
    }
    const parsed = parseMeetingFile(content);
    if (!parsed) {
        throw new Error(`Failed to parse meeting file: ${meetingPath}`);
    }
    const { frontmatter, body } = parsed;
    const transcript = extractTranscript(body);
    // Build meeting section
    const meeting = {
        path: absPath,
        title: frontmatter.title,
        date: frontmatter.date,
        attendees: frontmatter.attendees.map((a) => a.email || a.name).filter(Boolean),
        transcript,
    };
    // 2. Find agenda
    let agenda = null;
    if (!options.skipAgenda) {
        let agendaPath = null;
        // First check frontmatter agenda field
        if (frontmatter.agenda) {
            agendaPath = frontmatter.agenda.startsWith('/')
                ? frontmatter.agenda
                : resolve(paths.root, frontmatter.agenda);
        }
        else {
            // Try fuzzy match via findMatchingAgenda
            const relativePath = await findMatchingAgenda(storage, paths.root, frontmatter.date, frontmatter.title);
            if (relativePath) {
                agendaPath = resolve(paths.root, relativePath);
            }
        }
        if (agendaPath) {
            const agendaContent = await storage.read(agendaPath);
            if (agendaContent) {
                const items = parseAgendaItems(agendaContent);
                const unchecked = getUncheckedAgendaItems(agendaContent);
                agenda = {
                    path: agendaPath,
                    items,
                    unchecked,
                };
            }
            else {
                warnings.push(`Agenda file not found: ${agendaPath}`);
            }
        }
    }
    // 3. Resolve attendees
    const resolvedAttendees = [];
    const unknownAttendees = [];
    if (!options.skipPeople) {
        for (const attendee of frontmatter.attendees) {
            try {
                const resolved = await resolveAttendee(storage, entity, paths, attendee);
                if (resolved) {
                    resolvedAttendees.push(resolved);
                }
                else {
                    unknownAttendees.push({
                        email: attendee.email,
                        name: attendee.name,
                    });
                    if (attendee.email || attendee.name) {
                        warnings.push(`No profile found for: ${attendee.email || attendee.name}`);
                    }
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                warnings.push(`Failed to resolve attendee ${attendee.name}: ${msg}`);
                unknownAttendees.push({
                    email: attendee.email,
                    name: attendee.name,
                });
            }
        }
    }
    // 4. Get related context via brief service (using meeting title only)
    let relatedContext = {
        goals: [],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
    };
    try {
        const briefing = await intelligence.assembleBriefing({
            task: frontmatter.title,
            paths,
        });
        relatedContext = extractRelatedContext(briefing.markdown);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Brief service failed: ${msg}`);
        // Continue with empty relatedContext (pre-mortem mitigation)
    }
    return {
        meeting,
        agenda,
        attendees: resolvedAttendees,
        unknownAttendees,
        relatedContext,
        warnings,
    };
}
//# sourceMappingURL=meeting-context.js.map