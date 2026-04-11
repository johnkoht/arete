/**
 * EntityService — resolves entity references, relationships, and people management.
 *
 * Ported from src/core/entity-resolution.ts and src/core/people.ts.
 * Uses StorageAdapter for all file I/O (no direct fs imports).
 */
import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
const PEOPLE_CATEGORIES = ['internal', 'customers', 'users'];
/**
 * Maximum number of results to request from SearchProvider when pre-filtering
 * meeting candidates for a person. If the provider returns this many results,
 * the index may be incomplete — we fall back to a full scan.
 */
const SEARCH_PROVIDER_CANDIDATE_LIMIT = 100;
const INDEX_HEADER = `# People Index

People you work with: internal colleagues, customers, and users.

| Name | Category | Email | Role | Company / Team |
|------|----------|-------|------|----------------|
`;
// ---------------------------------------------------------------------------
// Slugify (exported for compat)
// ---------------------------------------------------------------------------
/**
 * Generate a URL-safe slug from a name (e.g. "Jane Doe" -> "jane-doe").
 */
export function slugifyPersonName(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'unnamed';
}
// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------
function normalize(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function fuzzyScore(reference, candidate) {
    const refNorm = normalize(reference);
    const candNorm = normalize(candidate);
    if (!refNorm || !candNorm)
        return 0;
    if (refNorm === candNorm)
        return 100;
    const refSlug = refNorm.replace(/\s+/g, '-');
    const candSlug = candNorm.replace(/\s+/g, '-');
    if (refSlug === candSlug)
        return 90;
    if (candNorm.startsWith(refNorm))
        return 70;
    if (refNorm.startsWith(candNorm))
        return 60;
    const refWords = refNorm.split(' ').filter(w => w.length > 0);
    const candWords = candNorm.split(' ').filter(w => w.length > 0);
    const allFound = refWords.every(rw => candWords.some(cw => cw.includes(rw) || rw.includes(cw)));
    if (allFound && refWords.length > 0)
        return 50;
    const matching = refWords.filter(rw => candWords.some(cw => cw.includes(rw) || rw.includes(cw)));
    if (matching.length > 0)
        return 10 * matching.length;
    return 0;
}
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match)
        return null;
    try {
        const frontmatter = parseYaml(match[1]);
        return { frontmatter, body: match[2] };
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Person resolution
// ---------------------------------------------------------------------------
async function resolvePerson(storage, reference, paths) {
    const results = [];
    const refSlug = slugifyPersonName(reference);
    const refLower = reference.toLowerCase().trim();
    for (const cat of PEOPLE_CATEGORIES) {
        const catDir = join(paths.people, cat);
        const exists = await storage.exists(catDir);
        if (!exists)
            continue;
        const filePaths = await storage.list(catDir, { extensions: ['.md'] });
        for (const filePath of filePaths) {
            const baseName = filePath.split(/[/\\]/).pop() ?? '';
            if (baseName === 'index.md')
                continue;
            const slug = baseName.replace(/\.md$/, '');
            const content = await storage.read(filePath);
            if (content == null)
                continue;
            const parsed = parseFrontmatter(content);
            if (!parsed)
                continue;
            const { frontmatter } = parsed;
            const name = typeof frontmatter.name === 'string' ? frontmatter.name : '';
            const email = typeof frontmatter.email === 'string' ? frontmatter.email : '';
            const role = typeof frontmatter.role === 'string' ? frontmatter.role : '';
            const company = typeof frontmatter.company === 'string' ? frontmatter.company : '';
            let bestScore = 0;
            bestScore = Math.max(bestScore, fuzzyScore(reference, name));
            bestScore = Math.max(bestScore, fuzzyScore(refSlug, slug));
            if (email && refLower === email.toLowerCase()) {
                bestScore = Math.max(bestScore, 95);
            }
            if (email && email.toLowerCase().startsWith(refLower + '@')) {
                bestScore = Math.max(bestScore, 60);
            }
            if (bestScore > 0) {
                results.push({
                    type: 'person',
                    path: filePath,
                    name: name || slug,
                    slug,
                    metadata: {
                        category: cat,
                        email: email || undefined,
                        role: role || undefined,
                        company: company || undefined,
                    },
                    score: bestScore,
                });
            }
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Meeting resolution
// ---------------------------------------------------------------------------
async function resolveMeeting(storage, reference, paths) {
    const results = [];
    const meetingsDir = join(paths.resources, 'meetings');
    const exists = await storage.exists(meetingsDir);
    if (!exists)
        return results;
    const filePaths = await storage.list(meetingsDir, { extensions: ['.md'] });
    const refNorm = normalize(reference);
    for (const filePath of filePaths) {
        const baseName = filePath.split(/[/\\]/).pop() ?? '';
        if (baseName === 'index.md')
            continue;
        const fileBase = baseName.replace(/\.md$/, '');
        let bestScore = fuzzyScore(reference, fileBase);
        let title = '';
        let date = '';
        let attendees = '';
        let attendeeIds = [];
        const content = await storage.read(filePath);
        if (content != null) {
            const parsed = parseFrontmatter(content);
            if (parsed) {
                const fm = parsed.frontmatter;
                title = typeof fm.title === 'string' ? fm.title : '';
                date = typeof fm.date === 'string' ? fm.date : '';
                attendees = typeof fm.attendees === 'string' ? fm.attendees : '';
                attendeeIds = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : [];
            }
        }
        if (title) {
            bestScore = Math.max(bestScore, fuzzyScore(reference, title));
        }
        if (date && refNorm.includes(normalize(date))) {
            bestScore = Math.max(bestScore, 80);
        }
        if (attendees) {
            const attendeeScore = fuzzyScore(reference, attendees);
            if (attendeeScore > 0) {
                bestScore = Math.max(bestScore, Math.min(attendeeScore, 50));
            }
        }
        for (const aid of attendeeIds) {
            if (normalize(aid).includes(refNorm) || refNorm.includes(normalize(aid))) {
                bestScore = Math.max(bestScore, 40);
            }
        }
        if (bestScore > 0) {
            results.push({
                type: 'meeting',
                path: filePath,
                name: title || fileBase,
                slug: fileBase,
                metadata: {
                    date,
                    attendees,
                    attendee_ids: attendeeIds,
                },
                score: bestScore,
            });
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Project resolution
// ---------------------------------------------------------------------------
async function resolveProject(storage, reference, paths) {
    const results = [];
    const projectBases = [
        { dir: join(paths.projects, 'active'), status: 'active' },
        { dir: join(paths.projects, 'archive'), status: 'archived' },
    ];
    for (const { dir, status } of projectBases) {
        const exists = await storage.exists(dir);
        if (!exists)
            continue;
        const projectDirs = await storage.listSubdirectories(dir);
        for (const projDir of projectDirs) {
            const projName = projDir.split(/[/\\]/).pop() ?? '';
            const readmePath = join(projDir, 'README.md');
            let bestScore = fuzzyScore(reference, projName);
            let title = projName;
            let summary = '';
            const existsReadme = await storage.exists(readmePath);
            if (existsReadme) {
                const content = await storage.read(readmePath);
                if (content != null) {
                    try {
                        const titleMatch = content.match(/^#\s+(.+)/m);
                        if (titleMatch) {
                            title = titleMatch[1].trim();
                            bestScore = Math.max(bestScore, fuzzyScore(reference, title));
                        }
                        const parsed = parseFrontmatter(content);
                        if (parsed?.frontmatter.title) {
                            const fmTitle = String(parsed.frontmatter.title);
                            bestScore = Math.max(bestScore, fuzzyScore(reference, fmTitle));
                        }
                        const refWords = normalize(reference).split(' ').filter(w => w.length > 1);
                        const bodyLower = content.toLowerCase();
                        const bodyMatches = refWords.filter(w => bodyLower.includes(w));
                        if (bodyMatches.length > 0 && bodyMatches.length >= refWords.length * 0.5) {
                            bestScore = Math.max(bestScore, 10 * bodyMatches.length);
                        }
                        const lines = content.replace(/^---[\s\S]*?---\n?/, '').split('\n');
                        const nonHeading = lines.filter(l => !l.startsWith('#') && l.trim().length > 0);
                        summary = nonHeading.slice(0, 2).join(' ').trim().slice(0, 200);
                    }
                    catch {
                        // use directory-name scoring only
                    }
                }
            }
            if (bestScore > 0) {
                results.push({
                    type: 'project',
                    path: projDir,
                    name: title,
                    slug: projName,
                    metadata: {
                        status,
                        summary: summary || undefined,
                    },
                    score: bestScore,
                });
            }
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Mention / relationship helpers
// ---------------------------------------------------------------------------
function getSourceType(filePath, paths) {
    const meetingsDir = join(paths.resources, 'meetings');
    const conversationsDir = join(paths.resources, 'conversations');
    // Use trailing '/' to prevent prefix collisions (e.g. 'meetings-archive' matching 'meetings')
    if (filePath.startsWith(meetingsDir + '/'))
        return 'meeting';
    if (filePath.startsWith(conversationsDir + '/'))
        return 'conversation';
    if (filePath.startsWith(paths.memory))
        return 'memory';
    if (filePath.startsWith(paths.projects))
        return 'project';
    return 'context';
}
function extractExcerpt(content, entityName, chars = 50) {
    const lowerContent = content.toLowerCase();
    const lowerName = entityName.toLowerCase();
    const idx = lowerContent.indexOf(lowerName);
    if (idx === -1)
        return '';
    const start = Math.max(0, idx - chars);
    const end = Math.min(content.length, idx + entityName.length + chars);
    let excerpt = content.slice(start, end).replace(/\r?\n/g, ' ').trim();
    if (start > 0)
        excerpt = '...' + excerpt;
    if (end < content.length)
        excerpt = excerpt + '...';
    return excerpt;
}
function extractDateFromPath(filePath) {
    const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : undefined;
}
function extractDateFromContent(content) {
    const fmMatch = content.match(/^---[\s\S]*?date:\s*["']?(\d{4}-\d{2}-\d{2})["']?[\s\S]*?---/);
    return fmMatch ? fmMatch[1] : undefined;
}
function contentContainsEntity(content, entityName, entitySlug) {
    const lower = content.toLowerCase();
    if (lower.includes(entityName.toLowerCase()))
        return true;
    if (entitySlug && lower.includes(entitySlug.toLowerCase()))
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// People management helpers
// ---------------------------------------------------------------------------
function parseFrontmatterPeople(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match)
        return null;
    try {
        const frontmatter = parseYaml(match[1]);
        return { frontmatter, body: match[2].trim() };
    }
    catch {
        return null;
    }
}
async function readPersonFile(storage, category, slug, filePath) {
    const exists = await storage.exists(filePath);
    if (!exists)
        return null;
    const content = await storage.read(filePath);
    if (content == null)
        return null;
    const parsed = parseFrontmatterPeople(content);
    if (!parsed)
        return null;
    const { frontmatter } = parsed;
    const name = frontmatter.name;
    if (typeof name !== 'string' || !name.trim())
        return null;
    const categoryFromFile = frontmatter.category;
    const resolvedCategory = categoryFromFile && PEOPLE_CATEGORIES.includes(categoryFromFile)
        ? categoryFromFile
        : category;
    return {
        slug,
        name: String(name).trim(),
        email: frontmatter.email != null ? String(frontmatter.email) : null,
        role: frontmatter.role != null ? String(frontmatter.role) : null,
        company: frontmatter.company != null ? String(frontmatter.company) : null,
        team: frontmatter.team != null ? String(frontmatter.team) : null,
        category: resolvedCategory,
    };
}
async function listPersonFilesInCategory(storage, peopleDir, category) {
    const dir = join(peopleDir, category);
    const exists = await storage.exists(dir);
    if (!exists)
        return [];
    const filePaths = await storage.list(dir, { extensions: ['.md'] });
    return filePaths
        .map(fp => fp.split(/[/\\]/).pop() ?? '')
        .filter(name => name !== '' && name !== 'index.md')
        .map(name => name.replace(/\.md$/, ''));
}
function escapeTableCell(s) {
    if (s == null || s === '')
        return '—';
    return String(s).replace(/\|/g, ' ').replace(/\r?\n/g, ' ').trim();
}
// Person memory signal collection, aggregation, rendering, and upsert — extracted to person-memory.ts
import { collectSignalsForPerson, aggregateSignals, renderPersonMemorySection, getPersonMemoryLastRefreshed, isMemoryStale, upsertPersonMemorySection, extractHashesFromContent, extractCheckedHashes, } from './person-memory.js';
import { extractStancesForPerson, isActionItemStale, deduplicateActionItems, capActionItems, } from './person-signals.js';
import { parseActionItemsFromMeeting } from './meeting-parser.js';
import { computeRelationshipHealth } from './person-health.js';
const DEFAULT_FEATURE_TOGGLES = {
    enableExtractionTuning: false,
    enableEnrichment: false,
};
const DEFAULT_POLICY = {
    confidenceThreshold: 0.65,
    defaultTrackingIntent: 'track',
    features: DEFAULT_FEATURE_TOGGLES,
};
function normalizeDomain(domain) {
    return domain.trim().toLowerCase().replace(/^www\./, '');
}
function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function sanitizePolicy(input) {
    if (!input || typeof input !== 'object')
        return DEFAULT_POLICY;
    const maybe = input;
    const thresholdRaw = toNumber(maybe.confidenceThreshold);
    const threshold = thresholdRaw == null ? DEFAULT_POLICY.confidenceThreshold : Math.min(0.95, Math.max(0.05, thresholdRaw));
    const tracking = maybe.defaultTrackingIntent;
    const defaultTrackingIntent = tracking === 'track' || tracking === 'defer' || tracking === 'ignore'
        ? tracking
        : DEFAULT_POLICY.defaultTrackingIntent;
    const featuresRaw = maybe.features;
    const featuresObj = featuresRaw && typeof featuresRaw === 'object'
        ? featuresRaw
        : {};
    return {
        confidenceThreshold: threshold,
        defaultTrackingIntent,
        features: {
            enableExtractionTuning: typeof featuresObj.enableExtractionTuning === 'boolean'
                ? featuresObj.enableExtractionTuning
                : DEFAULT_FEATURE_TOGGLES.enableExtractionTuning,
            enableEnrichment: typeof featuresObj.enableEnrichment === 'boolean'
                ? featuresObj.enableEnrichment
                : DEFAULT_FEATURE_TOGGLES.enableEnrichment,
        },
    };
}
function extractEmailDomain(email) {
    if (!email)
        return null;
    const match = email.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
    return match ? match[1] : null;
}
function detectRoleLens(text) {
    const lower = text.toLowerCase();
    if (/(customer|buyer|prospect|account|renewal|deal)/.test(lower))
        return 'customer';
    if (/(user interview|usability|participant|beta user|end user|persona)/.test(lower))
        return 'user';
    if (/(partner|reseller|alliance|integrator)/.test(lower))
        return 'partner';
    return 'unknown';
}
function computeTriageBurdenMinutes(unknownQueueCount) {
    if (unknownQueueCount <= 0)
        return 0;
    return Math.max(5, Math.ceil(unknownQueueCount / 5) * 5);
}
function deriveCategory(affiliation, roleLens) {
    if (affiliation === 'internal')
        return 'internal';
    if (roleLens === 'customer')
        return 'customers';
    if (roleLens === 'user')
        return 'users';
    return 'unknown_queue';
}
function buildRationale(affiliation, roleLens, evidenceCount, confidence) {
    const parts = [
        `Affiliation: ${affiliation}`,
        `Role lens: ${roleLens}`,
        `Evidence items: ${evidenceCount}`,
        `Confidence: ${confidence.toFixed(2)}`,
    ];
    return parts.join(' | ');
}
export class EntityService {
    storage;
    searchProvider;
    directoryProvider;
    constructor(storage, searchProvider, directoryProvider) {
        this.storage = storage;
        this.searchProvider = searchProvider;
        this.directoryProvider = directoryProvider;
    }
    async resolve(reference, type, workspacePaths) {
        if (!reference?.trim())
            return null;
        const candidates = [];
        if (type === 'person' || type === 'any') {
            candidates.push(...(await resolvePerson(this.storage, reference, workspacePaths)));
        }
        if (type === 'meeting' || type === 'any') {
            candidates.push(...(await resolveMeeting(this.storage, reference, workspacePaths)));
        }
        if (type === 'project' || type === 'any') {
            candidates.push(...(await resolveProject(this.storage, reference, workspacePaths)));
        }
        // Directory fallback: try GWS directory when no local person found
        if ((type === 'person' || type === 'any') && candidates.length === 0 && this.directoryProvider) {
            try {
                const dirResults = await this.directoryProvider.searchDirectory(reference, { maxResults: 3 });
                for (const person of dirResults) {
                    candidates.push({
                        type: 'person',
                        name: person.name,
                        slug: person.email,
                        path: '',
                        score: 0.5,
                        source: 'directory',
                        metadata: {
                            email: person.email,
                            title: person.title,
                            department: person.department,
                            manager: person.manager,
                        },
                    });
                }
            }
            catch {
                // Directory lookup failed — degrade gracefully
            }
        }
        if (candidates.length === 0)
            return null;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0];
    }
    async resolveAll(reference, type, workspacePaths, limit = 5) {
        if (!reference?.trim())
            return [];
        const candidates = [];
        if (type === 'person' || type === 'any') {
            candidates.push(...(await resolvePerson(this.storage, reference, workspacePaths)));
        }
        if (type === 'meeting' || type === 'any') {
            candidates.push(...(await resolveMeeting(this.storage, reference, workspacePaths)));
        }
        if (type === 'project' || type === 'any') {
            candidates.push(...(await resolveProject(this.storage, reference, workspacePaths)));
        }
        // Directory fallback: try GWS directory when no local person found
        const personCandidates = candidates.filter((c) => c.type === 'person');
        if ((type === 'person' || type === 'any') && personCandidates.length === 0 && this.directoryProvider) {
            try {
                const dirResults = await this.directoryProvider.searchDirectory(reference, { maxResults: 3 });
                for (const person of dirResults) {
                    candidates.push({
                        type: 'person',
                        name: person.name,
                        slug: person.email,
                        path: '',
                        score: 0.5,
                        source: 'directory',
                        metadata: {
                            email: person.email,
                            title: person.title,
                            department: person.department,
                            manager: person.manager,
                        },
                    });
                }
            }
            catch {
                // Directory lookup failed — degrade gracefully
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, limit);
    }
    async findMentions(entity, workspacePaths) {
        const mentions = [];
        const entityName = entity.name;
        const entitySlug = entity.slug;
        const scanDirs = [
            { dir: workspacePaths.context, recursive: true },
            { dir: join(workspacePaths.resources, 'meetings'), recursive: false },
            { dir: join(workspacePaths.resources, 'conversations'), recursive: false },
            { dir: join(workspacePaths.memory, 'items'), recursive: false },
        ];
        // Scan fixed directories
        for (const { dir, recursive } of scanDirs) {
            const exists = await this.storage.exists(dir);
            if (!exists)
                continue;
            const filePaths = await this.storage.list(dir, { extensions: ['.md'], recursive });
            for (const filePath of filePaths) {
                const content = await this.storage.read(filePath);
                if (content == null)
                    continue;
                if (!contentContainsEntity(content, entityName, entitySlug))
                    continue;
                const excerpt = extractExcerpt(content, entityName);
                if (!excerpt)
                    continue;
                const sourceType = getSourceType(filePath, workspacePaths);
                const date = extractDateFromPath(filePath) ?? extractDateFromContent(content);
                mentions.push({
                    entity: entityName,
                    entityType: entity.type,
                    sourcePath: filePath,
                    sourceType,
                    excerpt,
                    date,
                });
            }
        }
        // Scan project directories (projects/active/*)
        const activeDir = join(workspacePaths.projects, 'active');
        const activeExists = await this.storage.exists(activeDir);
        if (activeExists) {
            const projectDirs = await this.storage.listSubdirectories(activeDir);
            for (const projDir of projectDirs) {
                const projFiles = await this.storage.list(projDir, { extensions: ['.md'], recursive: true });
                for (const filePath of projFiles) {
                    const content = await this.storage.read(filePath);
                    if (content == null)
                        continue;
                    if (!contentContainsEntity(content, entityName, entitySlug))
                        continue;
                    const excerpt = extractExcerpt(content, entityName);
                    if (!excerpt)
                        continue;
                    const date = extractDateFromPath(filePath) ?? extractDateFromContent(content);
                    mentions.push({
                        entity: entityName,
                        entityType: entity.type,
                        sourcePath: filePath,
                        sourceType: 'project',
                        excerpt,
                        date,
                    });
                }
            }
        }
        // Sort by date (newest first), undated last
        mentions.sort((a, b) => {
            if (a.date && b.date)
                return b.date.localeCompare(a.date);
            if (a.date)
                return -1;
            if (b.date)
                return 1;
            return 0;
        });
        return mentions;
    }
    async getRelationships(entity, workspacePaths) {
        const relationships = [];
        const entityName = entity.name;
        const entitySlug = entity.slug;
        // 1. works_on: Scan project README files for team/owner sections
        const activeDir = join(workspacePaths.projects, 'active');
        const activeExists = await this.storage.exists(activeDir);
        if (activeExists) {
            const projectDirs = await this.storage.listSubdirectories(activeDir);
            for (const projDir of projectDirs) {
                const readmePath = join(projDir, 'README.md');
                const readmeExists = await this.storage.exists(readmePath);
                if (!readmeExists)
                    continue;
                const content = await this.storage.read(readmePath);
                if (content == null)
                    continue;
                const projName = projDir.split(/[/\\]/).pop() ?? '';
                const titleMatch = content.match(/^#\s+(.+)/m);
                const projectTitle = titleMatch ? titleMatch[1].trim() : projName;
                if (this.matchesTeamOrOwner(content, entityName, entitySlug)) {
                    relationships.push({
                        from: entityName,
                        fromType: entity.type,
                        to: projectTitle,
                        toType: 'project',
                        type: 'works_on',
                        evidence: readmePath,
                    });
                }
            }
        }
        // 2. attended: Scan meeting files for attendees
        const meetingsDir = join(workspacePaths.resources, 'meetings');
        const meetingsExist = await this.storage.exists(meetingsDir);
        if (meetingsExist) {
            const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });
            for (const filePath of meetingFiles) {
                const baseName = filePath.split(/[/\\]/).pop() ?? '';
                if (baseName === 'index.md')
                    continue;
                const content = await this.storage.read(filePath);
                if (content == null)
                    continue;
                const parsed = parseFrontmatter(content);
                const meetingTitle = parsed?.frontmatter.title
                    ? String(parsed.frontmatter.title)
                    : baseName.replace(/\.md$/, '');
                if (this.matchesAttendee(content, parsed, entityName, entitySlug)) {
                    relationships.push({
                        from: entityName,
                        fromType: entity.type,
                        to: meetingTitle,
                        toType: 'meeting',
                        type: 'attended',
                        evidence: filePath,
                    });
                }
            }
        }
        // 3. mentioned_in: Convert findMentions results to relationships
        const mentions = await this.findMentions(entity, workspacePaths);
        for (const mention of mentions) {
            const sourceName = mention.sourcePath.split(/[/\\]/).pop()?.replace(/\.md$/, '') ?? mention.sourcePath;
            relationships.push({
                from: entityName,
                fromType: entity.type,
                to: sourceName,
                toType: mention.sourceType === 'meeting' ? 'meeting' : 'project',
                type: 'mentioned_in',
                evidence: mention.sourcePath,
            });
        }
        return relationships;
    }
    /**
     * Check if content has team/owner sections mentioning the entity.
     */
    matchesTeamOrOwner(content, entityName, entitySlug) {
        const lower = content.toLowerCase();
        const nameLower = entityName.toLowerCase();
        const slugLower = entitySlug?.toLowerCase();
        // Check frontmatter fields: owner, team
        const parsed = parseFrontmatter(content);
        if (parsed) {
            const fm = parsed.frontmatter;
            const owner = typeof fm.owner === 'string' ? fm.owner.toLowerCase() : '';
            const team = typeof fm.team === 'string' ? fm.team.toLowerCase() : '';
            if (owner && (owner.includes(nameLower) || (slugLower && owner.includes(slugLower))))
                return true;
            if (team && (team.includes(nameLower) || (slugLower && team.includes(slugLower))))
                return true;
        }
        // Check for "Owner:" or "Team:" lines in body
        const ownerPattern = /(?:^|\n)\s*(?:owner|lead):\s*(.+)/gi;
        let match;
        while ((match = ownerPattern.exec(content)) !== null) {
            const value = match[1].toLowerCase();
            if (value.includes(nameLower) || (slugLower && value.includes(slugLower)))
                return true;
        }
        const teamPattern = /(?:^|\n)##\s*team\b[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/gi;
        while ((match = teamPattern.exec(content)) !== null) {
            const section = match[1].toLowerCase();
            if (section.includes(nameLower) || (slugLower && section.includes(slugLower)))
                return true;
        }
        // Check for "Team:" inline pattern
        const teamLinePattern = /(?:^|\n)\s*team:\s*(.+)/gi;
        while ((match = teamLinePattern.exec(content)) !== null) {
            const value = match[1].toLowerCase();
            if (value.includes(nameLower) || (slugLower && value.includes(slugLower)))
                return true;
        }
        return false;
    }
    /**
     * Check if meeting content/frontmatter has this entity as an attendee.
     */
    matchesAttendee(content, parsed, entityName, entitySlug) {
        const nameLower = entityName.toLowerCase();
        const slugLower = entitySlug?.toLowerCase();
        // Check frontmatter attendees (string)
        if (parsed) {
            const fm = parsed.frontmatter;
            const attendeesStr = typeof fm.attendees === 'string' ? fm.attendees.toLowerCase() : '';
            if (attendeesStr && (attendeesStr.includes(nameLower) || (slugLower && attendeesStr.includes(slugLower)))) {
                return true;
            }
            // Check frontmatter attendee_ids (array)
            const attendeeIds = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : [];
            for (const aid of attendeeIds) {
                const aidLower = aid.toLowerCase();
                if (aidLower === nameLower || aidLower === slugLower)
                    return true;
                if (aidLower.includes(nameLower) || (slugLower && aidLower.includes(slugLower)))
                    return true;
            }
            // Check frontmatter attendees (array)
            const attendeesList = Array.isArray(fm.attendees) ? fm.attendees.map(String) : [];
            for (const att of attendeesList) {
                const attLower = att.toLowerCase();
                if (attLower === nameLower || attLower === slugLower)
                    return true;
                if (attLower.includes(nameLower) || (slugLower && attLower.includes(slugLower)))
                    return true;
            }
        }
        // Check for "Attendees:" line in body
        const attendeePattern = /(?:^|\n)\s*attendees?:\s*(.+)/gi;
        let match;
        while ((match = attendeePattern.exec(content)) !== null) {
            const value = match[1].toLowerCase();
            if (value.includes(nameLower) || (slugLower && value.includes(slugLower)))
                return true;
        }
        return false;
    }
    async refreshPersonMemory(workspacePaths, options = {}) {
        if (!workspacePaths?.people) {
            return { updated: 0, scannedPeople: 0, scannedMeetings: 0, skippedFresh: 0, stancesExtracted: 0, actionItemsExtracted: 0, itemsAgedOut: 0 };
        }
        const internalOptions = {
            personSlug: options.personSlug,
            minMentions: options.minMentions && options.minMentions > 0
                ? options.minMentions
                : 2,
        };
        const people = await this.listPeople(workspacePaths);
        const filteredPeople = internalOptions.personSlug
            ? people.filter((p) => p.slug === internalOptions.personSlug)
            : people;
        const refreshablePeople = [];
        let skippedFresh = 0;
        for (const person of filteredPeople) {
            const personPath = join(workspacePaths.people, person.category, `${person.slug}.md`);
            const content = await this.storage.read(personPath);
            if (!content)
                continue;
            const lastRefreshed = getPersonMemoryLastRefreshed(content);
            const stale = isMemoryStale(lastRefreshed, options.ifStaleDays);
            if (!stale) {
                skippedFresh += 1;
                continue;
            }
            refreshablePeople.push(person);
        }
        const meetingsDir = join(workspacePaths.resources, 'meetings');
        const meetingsExist = await this.storage.exists(meetingsDir);
        const meetingFiles = meetingsExist
            ? (await this.storage.list(meetingsDir, { extensions: ['.md'] }))
                .filter((p) => (p.split(/[/\\]/).pop() ?? '') !== 'index.md')
            : [];
        // Read workspace owner name from profile.md once for action item direction classification.
        let ownerName;
        let ownerSlug;
        const profilePath = join(workspacePaths.context, 'profile.md');
        const profileContent = await this.storage.read(profilePath);
        if (profileContent) {
            const parsedProfile = parseFrontmatter(profileContent);
            if (parsedProfile && typeof parsedProfile.frontmatter.name === 'string') {
                ownerName = parsedProfile.frontmatter.name;
                ownerSlug = slugifyPersonName(ownerName);
            }
        }
        const personSignals = new Map();
        const personStances = new Map();
        const personActionItems = new Map();
        const personMeetingDates = new Map();
        for (const person of refreshablePeople) {
            personSignals.set(person.slug, []);
            personStances.set(person.slug, []);
            personActionItems.set(person.slug, []);
            personMeetingDates.set(person.slug, []);
        }
        // LLM stance cache — prevents duplicate LLM calls for the same meeting+person
        // within a single refresh. Keyed by normalized absolute path + ':' + person slug.
        const stanceCache = new Map();
        // Meeting content cache — keyed by normalized absolute path so that the
        // same physical file is read at most once, regardless of whether the path
        // came from storage.list() (absolute) or SearchProvider (possibly relative).
        const meetingContentCache = new Map();
        // Pre-compute per-person meeting file candidates (SearchProvider pre-filter).
        // CRITICAL invariant: if SearchProvider returns 0 results for a person,
        // fall back to the full meetingFiles list — never skip scanning entirely.
        const personCandidateMeetings = new Map();
        for (const person of refreshablePeople) {
            if (this.searchProvider) {
                const results = await this.searchProvider.semanticSearch(person.name, {
                    limit: SEARCH_PROVIDER_CANDIDATE_LIMIT,
                });
                // If the provider hit the limit, the index may be incomplete — fall back to full scan.
                if (results.length > 0 && results.length < SEARCH_PROVIDER_CANDIDATE_LIMIT) {
                    // Normalize paths: SearchProvider may return relative paths (e.g. from qmd
                    // running with cwd: workspaceRoot). resolve() is a no-op for absolute paths.
                    personCandidateMeetings.set(person.slug, results.map((r) => resolve(workspacePaths.root, r.path)));
                }
                else {
                    // 0 results (person not indexed yet) OR limit hit (incomplete) → full scan
                    personCandidateMeetings.set(person.slug, meetingFiles);
                }
            }
            else {
                personCandidateMeetings.set(person.slug, meetingFiles);
            }
        }
        for (const person of refreshablePeople) {
            const signals = personSignals.get(person.slug);
            if (!signals)
                continue;
            const candidatePaths = personCandidateMeetings.get(person.slug) ?? meetingFiles;
            for (const meetingPath of candidatePaths) {
                // Cache lookup — normalized absolute path as key
                const normalizedPath = resolve(workspacePaths.root, meetingPath);
                let content;
                if (meetingContentCache.has(normalizedPath)) {
                    content = meetingContentCache.get(normalizedPath);
                }
                else {
                    content = await this.storage.read(normalizedPath);
                    meetingContentCache.set(normalizedPath, content ?? null);
                }
                if (!content)
                    continue;
                // parseFrontmatter is called once per person × meeting pair — O(people × meetings)
                // in the worst case. The meetingContentCache above reduces storage.read() to O(meetings),
                // but the parse itself still repeats for meetings shared across multiple people's candidate
                // lists. parseFrontmatter is a regex + YAML parse and is fast in practice; a parsed-result
                // cache would reduce this to O(meetings) if workspaces grow large enough to matter.
                const parsed = parseFrontmatter(content);
                const fromFilename = extractDateFromPath(meetingPath);
                const dateFromFrontmatter = parsed?.frontmatter.date;
                const date = typeof dateFromFrontmatter === 'string'
                    ? dateFromFrontmatter.slice(0, 10)
                    : (fromFilename ?? new Date().toISOString().slice(0, 10));
                const source = meetingPath.split(/[/\\]/).pop() ?? meetingPath;
                const attendeeIds = parsed && Array.isArray(parsed.frontmatter.attendee_ids)
                    ? parsed.frontmatter.attendee_ids.map(String)
                    : [];
                const attendeesRaw = parsed?.frontmatter.attendees;
                const attendeeNames = Array.isArray(attendeesRaw)
                    ? attendeesRaw.map(String).map((s) => s.toLowerCase())
                    : typeof attendeesRaw === 'string'
                        ? attendeesRaw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
                        : [];
                const inAttendeeIds = attendeeIds.includes(person.slug);
                const nameLower = person.name.toLowerCase();
                const inAttendeeNames = attendeeNames.some((n) => n.includes(nameLower));
                const mentionedInBody = content.toLowerCase().includes(nameLower);
                if (!inAttendeeIds && !inAttendeeNames && !mentionedInBody)
                    continue;
                // Track meeting dates for relationship health computation
                const meetingDates = personMeetingDates.get(person.slug);
                if (meetingDates) {
                    meetingDates.push(date);
                }
                signals.push(...collectSignalsForPerson(content, person.name, date, source));
                // Stance extraction (LLM-based, optional)
                if (options.callLLM) {
                    const stanceCacheKey = resolve(workspacePaths.root, meetingPath) + ':' + person.slug;
                    let stances;
                    if (stanceCache.has(stanceCacheKey)) {
                        stances = stanceCache.get(stanceCacheKey);
                    }
                    else {
                        stances = await extractStancesForPerson(content, person.name, options.callLLM);
                        // Fill in source and date for each stance
                        for (const stance of stances) {
                            stance.source = source;
                            stance.date = date;
                        }
                        stanceCache.set(stanceCacheKey, stances);
                    }
                    const personStanceList = personStances.get(person.slug);
                    if (personStanceList) {
                        personStanceList.push(...stances);
                    }
                }
                // Action item extraction: parse structured ## Action Items section.
                // If section exists → use parseActionItemsFromMeeting()
                // If section missing → returns empty array (preserves existing commitments via sync path)
                const actionItems = ownerSlug
                    ? parseActionItemsFromMeeting(content, person.slug, ownerSlug, source)
                    : [];
                const personActionItemList = personActionItems.get(person.slug);
                if (personActionItemList) {
                    personActionItemList.push(...actionItems);
                }
            }
        }
        // Scan conversation files — full body scan (no participant_ids dependency)
        const conversationsDir = join(workspacePaths.resources, 'conversations');
        const conversationsExist = await this.storage.exists(conversationsDir);
        const conversationFiles = conversationsExist
            ? (await this.storage.list(conversationsDir, { extensions: ['.md'] }))
                .filter((p) => (p.split(/[/\\]/).pop() ?? '') !== 'index.md')
            : [];
        for (const convPath of conversationFiles) {
            const content = await this.storage.read(convPath);
            if (!content)
                continue;
            const parsed = parseFrontmatter(content);
            const fromFilename = extractDateFromPath(convPath);
            const dateFromFrontmatter = parsed?.frontmatter.date;
            const date = typeof dateFromFrontmatter === 'string'
                ? dateFromFrontmatter.slice(0, 10)
                : (fromFilename ?? new Date().toISOString().slice(0, 10));
            const source = convPath.split(/[/\\]/).pop() ?? convPath;
            for (const person of refreshablePeople) {
                const signals = personSignals.get(person.slug);
                if (!signals)
                    continue;
                const nameLower = person.name.toLowerCase();
                const mentionedInBody = content.toLowerCase().includes(nameLower);
                if (!mentionedInBody)
                    continue;
                signals.push(...collectSignalsForPerson(content, person.name, date, source));
            }
        }
        // Post-loop lifecycle: dedup stances by topic+direction, apply action item lifecycle.
        let totalStances = 0;
        let totalActionItems = 0;
        let totalItemsAgedOut = 0;
        for (const person of refreshablePeople) {
            // Stance dedup: keep first occurrence per topic+direction
            const rawStances = personStances.get(person.slug) ?? [];
            const seenStanceKeys = new Set();
            const dedupedStances = [];
            for (const stance of rawStances) {
                const key = `${stance.topic.toLowerCase()}:${stance.direction}`;
                if (!seenStanceKeys.has(key)) {
                    seenStanceKeys.add(key);
                    dedupedStances.push(stance);
                }
            }
            personStances.set(person.slug, dedupedStances);
            totalStances += dedupedStances.length;
            // Action item lifecycle: mark stale, dedup, cap
            const rawItems = personActionItems.get(person.slug) ?? [];
            let agedOut = 0;
            for (const item of rawItems) {
                item.stale = isActionItemStale(item);
                if (item.stale)
                    agedOut += 1;
            }
            totalItemsAgedOut += agedOut;
            const freshItems = rawItems.filter((i) => !i.stale);
            const dedupedItems = deduplicateActionItems([], freshItems);
            const cappedItems = capActionItems(dedupedItems);
            personActionItems.set(person.slug, cappedItems);
            totalActionItems += cappedItems.length;
        }
        // Cross-person dedup: suppress owner self-reminder duplicates.
        // When the same action item text from the same meeting appears under both the
        // workspace owner's slug (self-reminder) and another person's slug (bilateral),
        // drop the owner's copy. Scoped to same-source to avoid cross-meeting false positives.
        if (ownerSlug && personActionItems.has(ownerSlug)) {
            const ownerItems = personActionItems.get(ownerSlug);
            if (ownerItems.length > 0) {
                const normalizeText = (t) => t.toLowerCase().trim().replace(/\s+/g, ' ');
                const bilateralKeys = new Set();
                for (const [slug, items] of personActionItems) {
                    if (slug === ownerSlug)
                        continue;
                    for (const item of items) {
                        bilateralKeys.add(normalizeText(item.text) + '\0' + item.source);
                    }
                }
                const filtered = ownerItems.filter((item) => !bilateralKeys.has(normalizeText(item.text) + '\0' + item.source));
                if (filtered.length < ownerItems.length) {
                    totalActionItems -= ownerItems.length - filtered.length;
                    personActionItems.set(ownerSlug, filtered);
                }
            }
        }
        let updated = 0;
        for (const person of refreshablePeople) {
            const category = person.category;
            const personPath = join(workspacePaths.people, category, `${person.slug}.md`);
            // Step 1: Read current person file content
            const content = await this.storage.read(personPath);
            if (!content)
                continue;
            const signals = personSignals.get(person.slug) ?? [];
            const aggregated = aggregateSignals(signals, internalOptions.minMentions);
            const stances = personStances.get(person.slug) ?? [];
            const actionItems = personActionItems.get(person.slug) ?? [];
            const meetingDates = personMeetingDates.get(person.slug) ?? [];
            const health = computeRelationshipHealth(meetingDates, actionItems.length);
            // CommitmentsService 7-step bidirectional sync (only when options.commitments provided)
            let personCommitments;
            if (options.commitments) {
                // Step 2: Parse existing hash comments from current file
                const fileHashes = extractHashesFromContent(content);
                const checkedHashes = extractCheckedHashes(content);
                // Step 3: Detect deleted lines — hash in CommitmentsService but NOT in file.
                // IMPORTANT: Only run deletion detection when the file already has hash comments
                // (i.e., was previously rendered with commitments). If fileHashes is empty, this
                // is the first render; absent hashes are NOT user-deleted lines.
                const deletedHashes = [];
                if (fileHashes.size > 0) {
                    const openInService = await options.commitments.listForPerson(person.slug);
                    const serviceHashes = openInService.map((c) => c.id.slice(0, 8));
                    for (const h of serviceHashes) {
                        if (!fileHashes.has(h))
                            deletedHashes.push(h);
                    }
                }
                // Combine checked + deleted (deduplicated)
                const detectedHashesSet = new Set([...checkedHashes, ...deletedHashes]);
                const detectedHashes = [...detectedHashesSet];
                // Step 4: Resolve checked/deleted BEFORE sync (order matters — see pre-mortem Risk 4)
                // If sync ran first, a re-extracted resolved item would be re-added as open before
                // it gets resolved here. This order ensures: resolve first → add new → stay resolved.
                if (detectedHashes.length > 0) {
                    await options.commitments.bulkResolve(detectedHashes);
                }
                // Step 5: Sync fresh action items extracted from meetings into CommitmentsService
                const freshItems = new Map([[person.slug, actionItems]]);
                const nameMap = new Map(refreshablePeople.map((p) => [p.slug, p.name]));
                await options.commitments.sync(freshItems, nameMap);
                // Step 6: Re-render from updated CommitmentsService state
                personCommitments = await options.commitments.listForPerson(person.slug);
            }
            const section = renderPersonMemorySection(aggregated.asks, aggregated.concerns, {
                stances,
                actionItems,
                health,
                ...(personCommitments !== undefined ? { commitments: personCommitments } : {}),
            });
            // Step 7: Upsert
            const nextContent = upsertPersonMemorySection(content, section);
            if (nextContent !== content) {
                if (!options.dryRun) {
                    await this.storage.write(personPath, nextContent);
                }
                updated += 1;
            }
        }
        return {
            updated,
            scannedPeople: filteredPeople.length,
            scannedMeetings: meetingFiles.length,
            scannedConversations: conversationFiles.length,
            skippedFresh,
            stancesExtracted: totalStances,
            actionItemsExtracted: totalActionItems,
            itemsAgedOut: totalItemsAgedOut,
        };
    }
    async listPeople(workspacePaths, options = {}) {
        if (!workspacePaths?.people)
            return [];
        const exists = await this.storage.exists(workspacePaths.people);
        if (!exists)
            return [];
        const { category } = options;
        const categories = category ? [category] : PEOPLE_CATEGORIES;
        const result = [];
        const seenSlugs = new Set();
        for (const cat of categories) {
            const slugs = await listPersonFilesInCategory(this.storage, workspacePaths.people, cat);
            for (const slug of slugs) {
                const filePath = join(workspacePaths.people, cat, `${slug}.md`);
                const person = await readPersonFile(this.storage, cat, slug, filePath);
                if (person) {
                    const key = `${cat}:${slug}`;
                    if (!seenSlugs.has(key)) {
                        seenSlugs.add(key);
                        result.push(person);
                    }
                }
            }
        }
        result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        return result;
    }
    async showPerson(slugOrEmail, workspacePaths) {
        if (!workspacePaths?.people)
            return null;
        if (slugOrEmail.includes('@')) {
            const normalizedEmail = slugOrEmail.trim().toLowerCase();
            for (const category of PEOPLE_CATEGORIES) {
                const slugs = await listPersonFilesInCategory(this.storage, workspacePaths.people, category);
                for (const slug of slugs) {
                    const filePath = join(workspacePaths.people, category, `${slug}.md`);
                    const person = await readPersonFile(this.storage, category, slug, filePath);
                    if (person?.email?.toLowerCase() === normalizedEmail)
                        return person;
                }
            }
            return null;
        }
        for (const category of PEOPLE_CATEGORIES) {
            const filePath = join(workspacePaths.people, category, `${slugOrEmail}.md`);
            const person = await readPersonFile(this.storage, category, slugOrEmail, filePath);
            if (person)
                return person;
        }
        return null;
    }
    async getPersonBySlug(workspacePaths, category, slug) {
        if (!workspacePaths?.people)
            return null;
        const filePath = join(workspacePaths.people, category, `${slug}.md`);
        return readPersonFile(this.storage, category, slug, filePath);
    }
    async getPersonByEmail(workspacePaths, email) {
        if (!workspacePaths?.people || !email?.trim())
            return null;
        const normalizedEmail = email.trim().toLowerCase();
        for (const category of PEOPLE_CATEGORIES) {
            const slugs = await listPersonFilesInCategory(this.storage, workspacePaths.people, category);
            for (const slug of slugs) {
                const filePath = join(workspacePaths.people, category, `${slug}.md`);
                const person = await readPersonFile(this.storage, category, slug, filePath);
                if (person?.email?.toLowerCase() === normalizedEmail)
                    return person;
            }
        }
        return null;
    }
    async loadPeopleIntelligencePolicy(workspacePaths) {
        if (!workspacePaths)
            return DEFAULT_POLICY;
        const policyPath = join(workspacePaths.context, 'people-intelligence-policy.json');
        const policyContent = await this.storage.read(policyPath);
        if (!policyContent)
            return DEFAULT_POLICY;
        try {
            const parsed = JSON.parse(policyContent);
            return sanitizePolicy(parsed);
        }
        catch {
            return DEFAULT_POLICY;
        }
    }
    mergePeopleIntelligencePolicy(policy, options) {
        const confidenceThreshold = options.confidenceThreshold ?? policy.confidenceThreshold;
        const defaultTrackingIntent = options.defaultTrackingIntent ?? policy.defaultTrackingIntent;
        const features = {
            enableExtractionTuning: options.features?.enableExtractionTuning ?? policy.features.enableExtractionTuning,
            enableEnrichment: options.features?.enableEnrichment ?? policy.features.enableEnrichment,
        };
        return {
            confidenceThreshold,
            defaultTrackingIntent,
            features,
        };
    }
    async savePeopleIntelligenceSnapshot(workspacePaths, digest) {
        if (!workspacePaths)
            return;
        const metricsDir = join(workspacePaths.memory, 'metrics');
        await this.storage.mkdir(metricsDir);
        const snapshotPath = join(metricsDir, 'people-intelligence.jsonl');
        const existing = (await this.storage.read(snapshotPath)) ?? '';
        const lines = existing
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .slice(-49);
        const snapshot = {
            createdAt: new Date().toISOString(),
            metrics: digest.metrics,
            totalCandidates: digest.totalCandidates,
            unknownQueueCount: digest.unknownQueueCount,
        };
        lines.push(JSON.stringify(snapshot));
        await this.storage.write(snapshotPath, lines.join('\n') + '\n');
    }
    async getRecentPeopleIntelligenceSnapshots(workspacePaths, limit = 8) {
        if (!workspacePaths)
            return [];
        const snapshotPath = join(workspacePaths.memory, 'metrics', 'people-intelligence.jsonl');
        const content = await this.storage.read(snapshotPath);
        if (!content)
            return [];
        const parsed = [];
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const candidate = JSON.parse(trimmed);
                if (typeof candidate.createdAt === 'string' &&
                    candidate.metrics &&
                    typeof candidate.totalCandidates === 'number' &&
                    typeof candidate.unknownQueueCount === 'number') {
                    parsed.push(candidate);
                }
            }
            catch {
                // ignore malformed lines
            }
        }
        return parsed.slice(-limit);
    }
    async suggestPeopleIntelligence(candidates, workspacePaths, options = {}) {
        const loadedPolicy = await this.loadPeopleIntelligencePolicy(workspacePaths);
        const policy = this.mergePeopleIntelligencePolicy(loadedPolicy, options);
        const confidenceThreshold = policy.confidenceThreshold;
        const defaultTrackingIntent = policy.defaultTrackingIntent;
        const domains = new Set((options.internalDomains ?? []).map(normalizeDomain));
        if (workspacePaths) {
            const profilePath = join(workspacePaths.context, 'profile.md');
            const profileContent = await this.storage.read(profilePath);
            const profileParsed = profileContent ? parseFrontmatter(profileContent) : null;
            const profileEmail = profileParsed && typeof profileParsed.frontmatter.email === 'string'
                ? profileParsed.frontmatter.email
                : null;
            const profileWebsite = profileParsed && typeof profileParsed.frontmatter.website === 'string'
                ? profileParsed.frontmatter.website
                : null;
            const profileDomain = extractEmailDomain(profileEmail);
            if (profileDomain)
                domains.add(profileDomain);
            if (profileWebsite) {
                try {
                    const host = new URL(profileWebsite.startsWith('http') ? profileWebsite : `https://${profileWebsite}`).hostname;
                    domains.add(normalizeDomain(host));
                }
                catch {
                    // ignore invalid website
                }
            }
            const domainHintsPath = join(workspacePaths.context, 'domain-hints.md');
            const domainHintsContent = await this.storage.read(domainHintsPath);
            const domainParsed = domainHintsContent ? parseFrontmatter(domainHintsContent) : null;
            const hints = domainParsed?.frontmatter.domains;
            if (Array.isArray(hints)) {
                for (const hint of hints) {
                    if (typeof hint === 'string' && hint.trim())
                        domains.add(normalizeDomain(hint));
                }
            }
        }
        const existingPeople = workspacePaths ? await this.listPeople(workspacePaths) : [];
        const existingByEmail = new Map();
        for (const person of existingPeople) {
            if (person.email) {
                existingByEmail.set(person.email.toLowerCase(), person);
            }
        }
        const suggestions = [];
        for (const candidate of candidates) {
            const evidence = [];
            let confidence = 0.2;
            let affiliation = 'unknown';
            let roleLens = 'unknown';
            const rawMergedText = [candidate.name, candidate.company, candidate.text]
                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                .join(' ');
            const mergedText = policy.features.enableExtractionTuning
                ? rawMergedText.replace(/\s+/g, ' ').trim()
                : rawMergedText;
            if (mergedText) {
                const detectedLens = detectRoleLens(mergedText);
                if (detectedLens !== 'unknown') {
                    roleLens = detectedLens;
                    confidence += 0.25;
                    evidence.push({
                        kind: 'text-signal',
                        source: candidate.source ?? 'candidate-input',
                        snippet: `Detected ${detectedLens} signal from text`,
                    });
                }
            }
            let enrichmentApplied = false;
            if (policy.features.enableEnrichment) {
                const companySignal = candidate.company?.trim();
                if (companySignal) {
                    enrichmentApplied = true;
                    confidence += 0.08;
                    evidence.push({
                        kind: 'enrichment',
                        source: candidate.source ?? 'candidate-input',
                        snippet: `Enrichment signal: company=${companySignal}`,
                    });
                    if (roleLens === 'unknown' && /customer|client|buyer/i.test(companySignal)) {
                        roleLens = 'customer';
                    }
                }
            }
            const emailDomain = extractEmailDomain(candidate.email);
            if (emailDomain) {
                if (domains.has(normalizeDomain(emailDomain))) {
                    affiliation = 'internal';
                    confidence += 0.45;
                    evidence.push({
                        kind: 'email-domain',
                        source: candidate.source ?? 'candidate-input',
                        snippet: `Email domain ${emailDomain} matches internal domain hints`,
                    });
                }
                else {
                    affiliation = 'external';
                    confidence += 0.2;
                    evidence.push({
                        kind: 'email-domain',
                        source: candidate.source ?? 'candidate-input',
                        snippet: `Email domain ${emailDomain} is not recognized as internal`,
                    });
                }
            }
            if (candidate.email) {
                const existing = existingByEmail.get(candidate.email.toLowerCase());
                if (existing) {
                    evidence.push({
                        kind: 'existing-person',
                        source: `people/${existing.category}/${existing.slug}.md`,
                        snippet: `Matched existing person record (${existing.category})`,
                    });
                    confidence += 0.2;
                    if (existing.category === 'internal') {
                        affiliation = 'internal';
                    }
                    else if (existing.category === 'customers' && roleLens === 'unknown') {
                        roleLens = 'customer';
                    }
                    else if (existing.category === 'users' && roleLens === 'unknown') {
                        roleLens = 'user';
                    }
                }
            }
            if (domains.size > 0) {
                evidence.push({
                    kind: 'profile-hint',
                    source: 'context/domain-hints.md',
                    snippet: `Internal domains available (${domains.size})`,
                });
            }
            confidence = Math.min(confidence, 0.99);
            const initialCategory = deriveCategory(affiliation, roleLens);
            const lowConfidence = confidence < confidenceThreshold;
            const category = lowConfidence ? 'unknown_queue' : initialCategory;
            const recommendationRole = lowConfidence ? 'unknown' : roleLens;
            const trackingIntent = lowConfidence ? 'defer' : defaultTrackingIntent;
            const status = !lowConfidence && evidence.length > 0 ? 'recommended' : 'needs-review';
            suggestions.push({
                candidate,
                recommendation: {
                    affiliation,
                    roleLens: recommendationRole,
                    trackingIntent,
                    category,
                },
                confidence,
                rationale: buildRationale(affiliation, recommendationRole, evidence.length, confidence),
                evidence,
                status,
                enrichmentApplied,
            });
        }
        const unknownQueueCount = suggestions.filter((s) => s.recommendation.category === 'unknown_queue').length;
        const suggestedCount = suggestions.filter((s) => s.status === 'recommended').length;
        const reviewed = suggestions.filter((s) => s.candidate.actualRoleLens && s.recommendation.roleLens !== 'unknown');
        const mismatches = reviewed.filter((s) => s.candidate.actualRoleLens !== s.recommendation.roleLens);
        const misclassificationRate = reviewed.length > 0
            ? mismatches.length / reviewed.length
            : null;
        const metrics = {
            misclassificationRate,
            triageBurdenMinutes: computeTriageBurdenMinutes(unknownQueueCount),
            interruptionComplaintRate: 0,
            unknownQueueRate: suggestions.length > 0 ? unknownQueueCount / suggestions.length : 0,
            extractionQualityScore: options.extractionQualityScore ?? null,
        };
        const digest = {
            mode: 'digest',
            totalCandidates: suggestions.length,
            suggestedCount,
            unknownQueueCount,
            suggestions,
            metrics,
            policy,
        };
        await this.savePeopleIntelligenceSnapshot(workspacePaths, digest);
        return digest;
    }
    async buildPeopleIndex(workspacePaths) {
        if (!workspacePaths?.people)
            return;
        const people = await this.listPeople(workspacePaths);
        const indexPath = join(workspacePaths.people, 'index.md');
        if (people.length === 0) {
            const content = INDEX_HEADER + '| (none yet) | — | — | — | — |\n';
            await this.storage.mkdir(workspacePaths.people);
            await this.storage.write(indexPath, content);
            return;
        }
        const rows = people.map(p => `| ${escapeTableCell(p.name)} | ${p.category} | ${escapeTableCell(p.email)} | ${escapeTableCell(p.role)} | ${escapeTableCell(p.company ?? p.team ?? null)} |`);
        const content = INDEX_HEADER + rows.join('\n') + '\n';
        await this.storage.mkdir(workspacePaths.people);
        await this.storage.write(indexPath, content);
    }
}
export { PEOPLE_CATEGORIES };
//# sourceMappingURL=entity.js.map