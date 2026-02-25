/**
 * IntelligenceService — assembles briefings and routes to skills.
 *
 * Ported from src/core/briefing.ts and src/core/skill-router.ts.
 * Orchestrates ContextService, MemoryService, and EntityService.
 * No direct fs imports — uses injected services only.
 */
// ---------------------------------------------------------------------------
// routeToSkill — ported from skill-router.ts
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
    'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please'
]);
const WORK_TYPE_KEYWORDS = {
    discovery: ['discovery', 'discover', 'research', 'explore', 'investigate', 'understand'],
    definition: ['define', 'prd', 'requirements', 'spec', 'specification'],
    delivery: ['deliver', 'launch', 'ship', 'release', 'rollout'],
    analysis: ['analyze', 'analysis', 'compare', 'evaluate', 'assess'],
    planning: ['plan', 'planning', 'goals', 'priorities', 'quarter', 'week', 'roadmap'],
    operations: ['sync', 'save', 'process', 'update', 'finalize', 'tour', 'review'],
};
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}
function scoreMatch(query, skill) {
    const q = query.toLowerCase().trim();
    const qTokens = tokenize(q);
    if (qTokens.length === 0)
        return 0;
    const qTokenSet = new Set(qTokens);
    const id = (skill.id || skill.name || '').toLowerCase().replace(/-/g, ' ');
    const desc = (skill.description || '').toLowerCase();
    const triggerPhrases = (skill.triggers || []).map(t => t.toLowerCase());
    let score = 0;
    if (id && (q.includes(id) || id.includes(qTokens.join(' ')) || qTokens.some(t => id.includes(t)))) {
        score += 20;
    }
    if (id && q.replace(/\s+/g, '-').includes(id)) {
        score += 15;
    }
    for (const phrase of triggerPhrases) {
        const exactMatch = q.includes(phrase);
        // Tokenize trigger phrase the same way we tokenize the query
        // This ensures stop words like "in", "and", "this" don't break matching
        const phraseTokens = tokenize(phrase);
        const tokenMatch = phraseTokens.length > 0 && phraseTokens.every(t => qTokenSet.has(t));
        if (exactMatch || tokenMatch) {
            score += 18;
        }
    }
    const descTokens = tokenize(desc);
    const overlap = qTokens.filter(t => descTokens.includes(t)).length;
    // Require minimum 2-token overlap for description scoring to reduce false positives
    // from incidental single-word matches (e.g., "team" matching "dev team" in description).
    // Single-word matches are too noisy; meaningful matches usually have 2+ overlapping words.
    if (overlap >= 2) {
        score += overlap * 4;
    }
    const descPhrases = desc
        .replace(/use when the user wants to/gi, '')
        .split(/[,.]/)
        .map(s => s.trim())
        .filter(s => s.length > 5);
    for (const phrase of descPhrases) {
        const words = tokenize(phrase);
        if (words.length >= 2 && words.every(w => q.includes(w))) {
            score += 10;
        }
    }
    if (skill.work_type) {
        const keywords = WORK_TYPE_KEYWORDS[skill.work_type] || [];
        const workTypeMatch = qTokens.some(t => keywords.includes(t));
        if (workTypeMatch) {
            score += 6;
        }
    }
    if (skill.category === 'essential') {
        score += 2;
    }
    else if (skill.category === 'default') {
        score += 1;
    }
    return score;
}
// ---------------------------------------------------------------------------
// assembleBriefing helpers
// ---------------------------------------------------------------------------
function extractEntityReferences(task) {
    const refs = [];
    const quotedMatches = task.match(/"([^"]+)"|'([^']+)'/g);
    if (quotedMatches) {
        for (const m of quotedMatches) {
            refs.push(m.replace(/["']/g, ''));
        }
    }
    const words = task.split(/\s+/);
    let currentName = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[^a-zA-Z'-]/g, '');
        if (word.length > 0 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
            const skipWords = new Set([
                'I', 'A', 'The', 'This', 'That', 'What', 'How', 'When', 'Where', 'Why',
                'Create', 'Build', 'Start', 'Run', 'Help', 'Prep', 'Plan', 'Review',
                'Write', 'Make', 'Do', 'Set', 'Get', 'Find', 'Show', 'Update',
                'For', 'With', 'About', 'From', 'Into', 'Before', 'After',
            ]);
            if (!skipWords.has(word)) {
                currentName.push(word);
            }
            else if (currentName.length > 0) {
                refs.push(currentName.join(' '));
                currentName = [];
            }
        }
        else {
            if (currentName.length > 0) {
                refs.push(currentName.join(' '));
                currentName = [];
            }
        }
    }
    if (currentName.length > 0) {
        refs.push(currentName.join(' '));
    }
    return [...new Set(refs)].filter(r => r.length > 1);
}
const RELATIONSHIP_LABELS = {
    works_on: 'works on',
    attended: 'attended',
    mentioned_in: 'mentioned in',
};
function formatBriefingMarkdown(task, skill, confidence, context, memory, entities, relationships, assembledAt) {
    const lines = [];
    lines.push(`## Primitive Briefing: ${task}`);
    lines.push('');
    lines.push(`**Assembled**: ${assembledAt.slice(0, 16).replace('T', ' ')}`);
    if (skill)
        lines.push(`**Skill**: ${skill}`);
    lines.push(`**Confidence**: ${confidence}`);
    lines.push('');
    const byPrimitive = new Map();
    const untagged = [];
    for (const file of context.files) {
        if (file.primitive) {
            const existing = byPrimitive.get(file.primitive) || [];
            existing.push(file);
            byPrimitive.set(file.primitive, existing);
        }
        else {
            untagged.push(file);
        }
    }
    for (const prim of context.primitives) {
        const files = byPrimitive.get(prim) || [];
        const gap = context.gaps.find(g => g.primitive === prim);
        lines.push(`### ${prim}`);
        if (files.length > 0) {
            const sortedFiles = [...files].sort((a, b) => {
                const scoreA = a.relevanceScore ?? 0;
                const scoreB = b.relevanceScore ?? 0;
                return scoreB - scoreA;
            });
            for (const f of sortedFiles) {
                const summary = f.summary || '(no summary)';
                const scoreStr = f.relevanceScore !== undefined
                    ? ` (relevance: ${f.relevanceScore.toFixed(2)})`
                    : '';
                lines.push(`- ${summary} — Source: \`${f.relativePath}\`${scoreStr}`);
            }
        }
        if (gap) {
            lines.push('');
            lines.push('**Gap**: ' + gap.description);
            if (gap.suggestion)
                lines.push(`  - Suggestion: ${gap.suggestion}`);
        }
        lines.push('');
    }
    if (untagged.length > 0) {
        lines.push('### Strategic Context');
        const sortedUntagged = [...untagged].sort((a, b) => {
            const scoreA = a.relevanceScore ?? 0;
            const scoreB = b.relevanceScore ?? 0;
            return scoreB - scoreA;
        });
        for (const f of sortedUntagged) {
            const summary = f.summary || '(no summary)';
            const scoreStr = f.relevanceScore !== undefined
                ? ` (relevance: ${f.relevanceScore.toFixed(2)})`
                : '';
            lines.push(`- ${summary} — Source: \`${f.relativePath}\`${scoreStr}`);
        }
        lines.push('');
    }
    if (memory.results.length > 0) {
        lines.push('### Relevant Memory');
        for (const item of memory.results.slice(0, 5)) {
            const dateStr = item.date ? `[${item.date}] ` : '';
            const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
            const titleMatch = item.content.match(/^###\s+(?:\d{4}-\d{2}-\d{2}:\s*)?(.+)/m);
            const title = titleMatch ? titleMatch[1].trim() : item.content.slice(0, 80);
            const scoreStr = item.score !== undefined
                ? ` (score: ${item.score.toFixed(2)})`
                : '';
            lines.push(`- **${typeLabel}**: ${dateStr}${title} — Source: \`${item.source}\`${scoreStr}`);
        }
        lines.push('');
    }
    if (entities.length > 0) {
        lines.push('### Resolved Entities');
        for (const entity of entities) {
            const meta = [];
            if (entity.type === 'person') {
                if (entity.metadata.role)
                    meta.push(String(entity.metadata.role));
                if (entity.metadata.company)
                    meta.push(String(entity.metadata.company));
                if (entity.metadata.category)
                    meta.push(String(entity.metadata.category));
            }
            else if (entity.type === 'meeting') {
                if (entity.metadata.date)
                    meta.push(String(entity.metadata.date));
            }
            else if (entity.type === 'project') {
                if (entity.metadata.status)
                    meta.push(String(entity.metadata.status));
            }
            const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
            lines.push(`- **${entity.type}**: ${entity.name}${metaStr} — \`${entity.path}\``);
        }
        lines.push('');
    }
    if (relationships.length > 0) {
        lines.push('### Entity Relationships');
        for (const rel of relationships) {
            const label = RELATIONSHIP_LABELS[rel.type] ?? rel.type;
            const evidence = rel.evidence ? ` (evidence: ${rel.evidence})` : '';
            lines.push(`- ${rel.from} ${label} ${rel.to}${evidence}`);
        }
        lines.push('');
    }
    if (context.gaps.length > 0) {
        lines.push('### Gaps');
        lines.push('**What\'s missing that this task might need:**');
        for (const gap of context.gaps) {
            const suggestion = gap.suggestion ? ` — Suggestion: ${gap.suggestion}` : '';
            lines.push(`- ${gap.description}${suggestion}`);
        }
        if (confidence === 'Low') {
            lines.push('');
            lines.push('**Note**: Low confidence indicates that semantic search found limited relevant content for this task. Consider adding more context to the workspace or refining the task description.');
        }
        lines.push('');
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// IntelligenceService
// ---------------------------------------------------------------------------
export class IntelligenceService {
    context;
    memory;
    entities;
    constructor(context, memory, entities) {
        this.context = context;
        this.memory = memory;
        this.entities = entities;
    }
    async assembleBriefing(request) {
        const now = new Date().toISOString();
        const { task, paths, skillName, primitives, workType } = request;
        const contextOptions = {};
        if (primitives)
            contextOptions.primitives = primitives;
        if (workType)
            contextOptions.workType = workType;
        // 1. Context files (ContextService already searches context/, goals/, projects/, people/, memory/)
        const context = await this.context.getRelevantContext({
            query: task,
            paths,
            primitives: contextOptions.primitives,
            workType: contextOptions.workType,
        });
        // 2. Memory search (decisions, learnings, observations)
        const memory = await this.memory.search({
            query: task,
            paths,
            limit: 10,
        });
        // 3. Proactive: also search meeting transcripts via memory timeline
        //    This catches meeting content that ContextService's temporal signals may reference
        //    but doesn't include as context files.
        const meetingContext = await this.searchMeetingTranscripts(task, paths, context);
        // 4. Proactive: search project docs beyond just README.md
        const projectContext = await this.searchProjectDocs(task, paths, context);
        // Merge proactive findings into context bundle (deduplicated)
        const mergedContext = this.mergeProactiveResults(context, [...meetingContext, ...projectContext]);
        // 5. Entity resolution
        const entityRefs = extractEntityReferences(task);
        const entities = [];
        const seenEntityPaths = new Set();
        for (const ref of entityRefs) {
            const resolved = await this.entities.resolveAll(ref, 'any', paths, 3);
            for (const entity of resolved) {
                if (!seenEntityPaths.has(entity.path)) {
                    seenEntityPaths.add(entity.path);
                    entities.push(entity);
                }
            }
        }
        // 6. Gather entity relationships
        const relationships = [];
        for (const entity of entities) {
            try {
                const rels = await this.entities.getRelationships(entity, paths);
                relationships.push(...rels);
            }
            catch {
                // Best-effort — don't fail briefing if relationship extraction fails
            }
        }
        // 7. Rank all files by relevance and deduplicate
        mergedContext.files.sort((a, b) => {
            const scoreA = a.relevanceScore ?? 0;
            const scoreB = b.relevanceScore ?? 0;
            return scoreB - scoreA;
        });
        const confidence = mergedContext.confidence;
        const markdown = formatBriefingMarkdown(task, skillName, confidence, mergedContext, memory, entities, relationships, now);
        return {
            task,
            skill: skillName,
            assembledAt: now,
            confidence,
            context: mergedContext,
            memory,
            entities,
            relationships,
            markdown,
        };
    }
    /**
     * Proactively search meeting transcripts for content matching the task.
     * Uses the memory timeline service to find meetings, then adds them as
     * context files if not already present.
     */
    async searchMeetingTranscripts(task, paths, existingContext) {
        const results = [];
        try {
            const timeline = await this.memory.getTimeline(task, paths, {
                start: undefined,
                end: undefined,
            });
            const existingPaths = new Set(existingContext.files.map(f => f.path));
            for (const item of timeline.items) {
                if (item.type !== 'meeting')
                    continue;
                // Build a path for dedupe — meetings come from resources/meetings/
                const meetingPath = item.source.includes('/')
                    ? item.source
                    : `resources/meetings/${item.source}`;
                const fullPath = meetingPath.startsWith('/')
                    ? meetingPath
                    : `${paths.root}/${meetingPath}`;
                if (existingPaths.has(fullPath))
                    continue;
                results.push({
                    path: fullPath,
                    relativePath: meetingPath,
                    category: 'resources',
                    summary: `Meeting: ${item.title} (${item.date})`,
                    relevanceScore: item.relevanceScore * 0.8, // Slightly discount meeting content
                });
            }
        }
        catch {
            // Best-effort — don't fail briefing if meeting search fails
        }
        return results.slice(0, 5);
    }
    /**
     * Proactively search project docs beyond README.md (e.g. PRDs, specs, notes).
     */
    async searchProjectDocs(task, paths, existingContext) {
        const results = [];
        const existingPaths = new Set(existingContext.files.map(f => f.path));
        const queryTokens = task.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        if (queryTokens.length === 0)
            return results;
        try {
            const activeDir = `${paths.projects}/active`;
            const subdirs = await this.context.listProjectSubdirs(activeDir);
            for (const projPath of subdirs) {
                // List all .md files in the project (not just README)
                const projFiles = await this.context.listProjectFiles(projPath);
                for (const filePath of projFiles) {
                    if (existingPaths.has(filePath))
                        continue;
                    const content = await this.context.readFile(filePath);
                    if (!content)
                        continue;
                    const lower = content.toLowerCase();
                    const matchCount = queryTokens.filter(t => lower.includes(t)).length;
                    if (matchCount === 0)
                        continue;
                    const score = Math.min(matchCount / queryTokens.length, 1) * 0.6;
                    const baseName = filePath.split(/[/\\]/).pop() ?? '';
                    const relPath = filePath.replace(paths.root + '/', '');
                    results.push({
                        path: filePath,
                        relativePath: relPath,
                        category: 'projects',
                        summary: `Project doc: ${baseName}`,
                        relevanceScore: score,
                    });
                    existingPaths.add(filePath);
                }
            }
        }
        catch {
            // Best-effort
        }
        return results.slice(0, 5);
    }
    /**
     * Merge proactive context results into the main context bundle, deduplicating by path.
     */
    mergeProactiveResults(context, additional) {
        const existingPaths = new Set(context.files.map(f => f.path));
        const merged = [...context.files];
        for (const file of additional) {
            if (!existingPaths.has(file.path)) {
                existingPaths.add(file.path);
                merged.push(file);
            }
        }
        return {
            ...context,
            files: merged,
        };
    }
    routeToSkill(query, skills) {
        if (!query?.trim() || skills.length === 0)
            return null;
        let best = null;
        for (const skill of skills) {
            const path = skill.path;
            const id = skill.id || skill.name || (path ? path.split(/[/\\]/).pop() : '');
            if (!id)
                continue;
            const score = scoreMatch(query, { ...skill, id });
            if (score > 0 && (!best || score > best.score)) {
                best = { skill: { ...skill, id, path }, score };
            }
        }
        if (!best || best.score < 4)
            return null;
        const path = best.skill.path || '';
        const reason = best.score >= 18
            ? 'Strong match from intent keywords or triggers'
            : 'Match from skill description';
        const isTool = best.skill.type === 'tool';
        return {
            skill: best.skill.id || best.skill.name || '',
            path,
            reason,
            primitives: best.skill.primitives,
            work_type: best.skill.work_type,
            category: best.skill.category,
            requires_briefing: best.skill.requires_briefing,
            type: isTool ? 'tool' : 'skill',
            action: isTool ? 'activate' : 'load',
            lifecycle: isTool ? best.skill.lifecycle : undefined,
            duration: isTool ? best.skill.duration : undefined,
        };
    }
    async prepareForSkill(skill, task, paths) {
        // 1. Build a briefing request using the skill's metadata
        const primitives = skill.primitives && skill.primitives.length > 0
            ? skill.primitives
            : undefined;
        const workType = skill.workType;
        // 2. Assemble full briefing with proactive search
        const briefing = await this.assembleBriefing({
            task,
            paths,
            skillName: skill.name,
            primitives,
            workType,
        });
        // 3. Get temporal patterns related to the task
        let recentMemory = [];
        try {
            const timeline = await this.memory.getTimeline(task, paths, {
                start: undefined,
                end: undefined,
            });
            // Extract the most recent and relevant items as memory results
            recentMemory = timeline.items.slice(0, 5).map(item => ({
                content: item.content,
                source: item.source,
                type: item.type === 'meeting' ? 'observations' : item.type,
                date: item.date,
                relevance: `Timeline match (score: ${item.relevanceScore.toFixed(2)})`,
                score: item.relevanceScore,
            }));
        }
        catch {
            // Best-effort — timeline failure shouldn't block skill preparation
        }
        // 4. Build the skill candidate for the SkillContext
        const skillCandidate = {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            path: skill.path,
            triggers: skill.triggers,
            primitives: skill.primitives,
            work_type: skill.workType,
            category: skill.category,
            intelligence: skill.intelligence,
            requires_briefing: skill.requiresBriefing,
            creates_project: skill.createsProject,
            project_template: skill.projectTemplate,
        };
        // 5. Combine briefing memory with recent timeline memory (deduplicate)
        const combinedMemory = [...briefing.memory.results];
        const seenSources = new Set(combinedMemory.map(m => `${m.source}:${m.date ?? ''}`));
        for (const item of recentMemory) {
            const key = `${item.source}:${item.date ?? ''}`;
            if (!seenSources.has(key)) {
                seenSources.add(key);
                combinedMemory.push(item);
            }
        }
        return {
            task,
            context: briefing.context,
            memory: combinedMemory,
            entities: briefing.entities,
            assembledAt: briefing.assembledAt,
            skill: skillCandidate,
        };
    }
}
//# sourceMappingURL=intelligence.js.map