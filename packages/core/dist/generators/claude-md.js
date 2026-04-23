/**
 * Generates CLAUDE.md content for Arete PM workspaces.
 *
 * Pure function — no I/O, no side effects.
 */
import { renderActiveTopicsAsWikilinks, maxLastRefreshed, } from '../models/active-topics.js';
/**
 * Generate the full CLAUDE.md content for an Arete workspace.
 *
 * @param memory optional workspace-state snapshot; when provided and
 *   non-empty, an "Active Topics" section is emitted so agents resolve
 *   `[[topic-slug]]` references on turn 1 without a round-trip search.
 *   Omit (or pass memory with empty activeTopics) on fresh workspaces
 *   to skip the section entirely — no placeholder text is emitted.
 *
 * **Idempotency contract**: for equal `(config, skills, memory)` inputs,
 * output is byte-equal. Footer carries no wall-clock timestamp; Active
 * Topics section header uses `max(entries[].lastRefreshed)`, not
 * `Date.now()`. Sort order in the topics list is data-deterministic.
 */
export function generateClaudeMd(config, skills, memory) {
    const sections = [
        generateIdentity(),
        generateWorkspaceStructure(),
        generateSlashCommands(skills),
        generateIntelligenceServices(),
        generateMemory(),
        generateActiveTopics(memory),
        generateWorkingPatterns(),
        generateFooter(config),
    ].filter((s) => s.length > 0);
    return sections.join('\n\n') + '\n';
}
/**
 * Render the Active Topics section. Returns empty string when memory
 * absent or activeTopics empty — caller filters out empty sections so
 * fresh workspaces produce byte-identical output with/without memory.
 */
function generateActiveTopics(memory) {
    if (memory === undefined)
        return '';
    if (memory.activeTopics.length === 0)
        return '';
    const asOf = maxLastRefreshed(memory.activeTopics);
    const asOfLine = asOf.length > 0 ? `Reflects memory as of ${asOf}` : 'Reflects current memory';
    const list = renderActiveTopicsAsWikilinks(memory.activeTopics);
    return `## Active Topics

> ${asOfLine} • Full catalog: \`.arete/memory/index.md\`

${list}`;
}
function generateIdentity() {
    return `# Arete PM Workspace

This is an Arete PM workspace. Arete (arete) means excellence — helping product builders
gain clarity, navigate ambiguity, and move faster.

You are a senior product partner embedded in a PM's daily workflow. You have access to
workspace context (goals, projects, people, meetings) and intelligence services that
let you search, brief, and resolve references across the workspace.

When a user asks for help, check if a slash command matches before doing ad-hoc work.`;
}
function generateWorkspaceStructure() {
    return `## Workspace Structure

\`\`\`
now/                  Current focus: week.md, today.md, scratchpad.md, agendas/
goals/                Strategy: strategy.md, quarter goals
context/              Business context — source of truth
projects/             active/, archive/
people/               internal/, customers/, users/
resources/            meetings/, notes/
.arete/               memory/items/, memory/summaries/
.agents/              skills/, profiles/
templates/            Workspace templates
\`\`\``;
}
function generateSlashCommands(skills) {
    const lines = [
        '## Slash Commands',
        '',
        '| Command | Description |',
        '|---------|-------------|',
    ];
    for (const skill of skills) {
        const desc = (skill.description || skill.name).replace(/\|/g, '\\|');
        lines.push(`| /${skill.id} | ${desc} |`);
    }
    lines.push('');
    lines.push('For ambiguous requests not matching a command, use `arete skill route "<message>"` to find the right skill.');
    return lines.join('\n');
}
function generateIntelligenceServices() {
    return `## Intelligence Services

Search, briefing, and resolution commands available via the \`arete\` CLI:

\`\`\`bash
# Search across workspace (scopes: memory, meetings, context, projects, people)
arete search "query"

# Temporal view — search with timeline
arete search "query" --timeline --days 30

# Structured briefing for a task or skill
arete brief --for "task" --skill name --json

# Resolve ambiguous references (people, projects, meetings)
arete resolve "name"

# Person profile with memory
arete people show <slug> --memory

# Open commitments
arete commitments list

# Re-index after file changes
arete index
\`\`\`

Use these services to ground your responses in workspace data rather than guessing.`;
}
function generateMemory() {
    return `## Memory

PM decisions are stored in \`.arete/memory/items/decisions.md\`.
Learnings are stored in \`.arete/memory/items/learnings.md\`.

When the user makes a notable decision or learns something worth preserving,
extract it with their approval using the \`extract_decisions_learnings\` pattern.

Claude Code's auto-memory handles agent observations natively — do not duplicate
what Claude Code already captures in its own memory system.`;
}
function generateWorkingPatterns() {
    return `## Working Patterns

- **Projects**: Active work lives in \`projects/active/\`. Each project has its own directory.
- **Context**: The \`context/\` directory is the source of truth for business context.
  Read it before making strategic recommendations.
- **Quick capture**: Use \`now/scratchpad.md\` for rapid notes and ideas.
- **People**: Person files in \`people/\` contain relationship context and meeting history.
- **Agent profiles**: Skills may reference agent profiles in \`.agents/profiles/\`.
  When a skill's frontmatter includes \`profile:\`, read the referenced profile
  at \`.agents/profiles/{profile}.md\` and adopt its voice and approach.
- **Templates**: Check \`templates/\` before creating new documents from scratch.`;
}
function generateFooter(config) {
    const version = config.version ?? 'unknown';
    // No wall-clock timestamp — the Active Topics section header already
    // carries a data-derived date. Keeping a `Date.now()` here would mean
    // every regeneration produces a fresh byte string, even when nothing
    // changed, creating unnecessary git diff noise on every
    // `arete memory refresh`.
    return `---

Generated by Arete v${version}`;
}
//# sourceMappingURL=claude-md.js.map