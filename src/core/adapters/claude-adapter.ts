/**
 * Claude Code IDE Adapter
 * 
 * Implements IDE adapter for Claude Code, providing Claude-specific workspace structure,
 * rule formatting, and CLAUDE.md generation with mandatory routing workflow.
 * 
 * Claude Code conventions as of 2026-02:
 * - .claude/ configuration directory
 * - .md file extension for rules
 * - YAML frontmatter without globs key when alwaysApply is true
 * - CLAUDE.md root file with project overview and agent instructions
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { IDEAdapter, CanonicalRule, IDETarget } from '../ide-adapter.js';
import type { AreteConfig } from '../../types.js';

/**
 * Claude Code IDE Adapter
 * 
 * Provides Claude Code-specific behavior:
 * - .claude/ configuration directory
 * - .md file extension for rules (not .mdc)
 * - YAML frontmatter omits globs when alwaysApply is true
 * - Path transformations (.cursor/ → .claude/)
 * - CLAUDE.md root file generation
 */
export class ClaudeAdapter implements IDEAdapter {
  readonly target: IDETarget = 'claude';
  readonly configDirName = '.claude';
  readonly ruleExtension = '.md';

  /**
   * Get all Claude-specific directory paths
   */
  getIDEDirs(): string[] {
    return [
      '.claude',
      '.claude/rules',
      '.claude/tools',
      '.claude/integrations',
      '.claude/integrations/configs',
    ];
  }

  /**
   * Get rules directory path
   */
  rulesDir(): string {
    return '.claude/rules';
  }

  /**
   * Get tools directory path
   */
  toolsDir(): string {
    return '.claude/tools';
  }

  /**
   * Get integrations directory path
   */
  integrationsDir(): string {
    return '.claude/integrations';
  }

  /**
   * Format a canonical rule as Claude .md with YAML frontmatter
   * 
   * Claude Code convention: when alwaysApply is true, omit the globs key entirely
   * (no globs = always loaded).
   * 
   * @param rule - Canonical rule representation
   * @param config - Areté configuration (unused by Claude adapter)
   * @returns Formatted .md content with YAML frontmatter
   */
  formatRule(rule: CanonicalRule, config: AreteConfig): string {
    const frontmatter: Record<string, any> = {
      description: rule.description,
    };

    // Claude convention: when alwaysApply is true, omit globs entirely
    if (rule.alwaysApply === true) {
      // Don't add globs key at all
    } else if (rule.globs && rule.globs.length > 0) {
      // Only include globs if not alwaysApply
      frontmatter.globs = rule.globs;
    }

    // Build YAML frontmatter
    const yamlLines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        // Multi-line YAML array format for globs
        yamlLines.push(`${key}:`);
        for (const item of value) {
          yamlLines.push(`  - "${item}"`);
        }
      } else if (typeof value === 'boolean') {
        yamlLines.push(`${key}: ${value}`);
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    }
    yamlLines.push('---');

    return `${yamlLines.join('\n')}\n\n${rule.content}`;
  }

  /**
   * Transform rule content for Claude Code
   *
   * 1. Replaces .cursor/skills/ with .agents/skills/ (skills live in shared dir)
   * 2. Replaces remaining .cursor/ path references with .claude/
   * 3. Replaces .mdc rule file extensions with .md (Claude uses .md for rules)
   *
   * Cross-references like "See .cursor/rules/agent-memory.mdc" become
   * "See .claude/rules/agent-memory.md" so links work in Claude workspaces.
   *
   * @param content - Original rule content
   * @returns Transformed content with .claude/ paths and .md extensions
   */
  transformRuleContent(content: string): string {
    return content
      .replace(/\.cursor\/skills\//g, '.agents/skills/')
      .replace(/\.cursor\//g, '.claude/')
      .replace(/\.mdc\b/g, '.md');
  }

  /**
   * Generate Claude-specific root files
   *
   * Creates CLAUDE.md with:
   * 1. Project overview (what Areté is)
   * 2. Mandatory routing workflow (inlined from routing-mandatory.mdc)
   * 3. Workspace structure
   * 4. Agent mode detection (BUILDER vs GUIDE)
   * 5. Memory management
   * 6. Key CLI commands
   * 7. Version and timestamp
   *
   * @param config - Areté configuration (for version)
   * @param workspaceRoot - Workspace root path (unused; kept for interface)
   * @param sourceRulesDir - Optional path to canonical rules dir (runtime/rules or dist/rules)
   * @returns Map with CLAUDE.md content
   */
  generateRootFiles(
    config: AreteConfig,
    workspaceRoot: string,
    sourceRulesDir?: string
  ): Record<string, string> {
    const timestamp = new Date().toISOString();
    const version = config.version || '1.0.0';

    // Read routing-mandatory.mdc content to inline in section 2
    // Fallback content if file doesn't exist or can't be read
    const fallbackRouting = `# 🛑 STOP - READ THIS FIRST

Before responding to ANY user request in this Areté workspace:

## Is this a PM action?

Meeting prep, planning, synthesis, discovery, PRD, roadmap, competitive analysis, process meetings, etc.

## If YES, follow this EXACT sequence:

\`\`\`bash
# 1. ROUTE (MANDATORY)
arete skill route "<user's exact message>"

# 2. LOAD (MANDATORY)  
# Read the skill file it returns, e.g.:
# .agents/skills/meeting-prep/SKILL.md

# 3. EXECUTE (MANDATORY)
# Follow the skill's complete workflow
# Do NOT improvise with Grep/Glob/Read
\`\`\`

## If NO:

Proceed with normal tools.

---

**You WILL be asked to verify you followed this. If you skipped the router and skill, you FAILED the task.**`;

    let routingContent = fallbackRouting;

    try {
      if (sourceRulesDir) {
        const routingPath = join(sourceRulesDir, 'routing-mandatory.mdc');
        if (existsSync(routingPath)) {
          const fullContent = readFileSync(routingPath, 'utf-8');
          const contentWithoutFrontmatter = fullContent.replace(/^---[\s\S]*?---\n\n/, '');
          routingContent = contentWithoutFrontmatter.trim();
        }
      }
    } catch (error) {
      // Use fallback on error (already set above)
    }

    const claudeMd = `# Areté - Product Builder's Operating System

You are an AI assistant operating in Areté, a Product Management workspace. This workspace helps PMs streamline their workflows through structured context, project-based work, and institutional memory.

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

Areté is a **product builder's operating system** — a workspace that manages product knowledge, provides intelligence services to any workflow, and creates a consistent interface between the messy reality of product work and the tools you use.

## ⚠️ CRITICAL: Skill-Based Workflow (Mandatory)

${routingContent}

## Workspace Structure

\`\`\`
product-workspace/
├── now/               # Start here. Current focus and working surface.
│   ├── scratchpad.md  # Quick capture, parking lot, working notes.
│   ├── week.md        # This week's priorities and outcomes.
│   └── today.md       # Today's focus (populated by daily-plan skill).
├── goals/             # Strategy and goals. What you're optimizing for.
│   ├── strategy.md    # Org strategy, OKRs, pillars.
│   ├── quarter.md     # Current quarter goals.
│   └── initiatives.md # Strategic bets that projects reference.
├── context/           # Core business context (source of truth)
├── resources/         # Raw inputs (L1: immutable, timestamped)
│   ├── meetings/      # Meeting notes and transcripts
│   └── notes/         # Standalone notes
├── projects/          # Active and archived projects
│   ├── index.md       # Project overview
│   ├── active/        # Currently in progress (2-3 max)
│   └── archive/       # Completed projects
├── people/            # People (internal, customers, users)
│   ├── index.md       # Table of all people
│   ├── internal/      # Colleagues, teammates
│   ├── customers/     # Key accounts, buyers
│   └── users/         # Product users
├── templates/         # Project, input, and output templates
├── .credentials/      # API keys and tokens (gitignored)
├── .claude/           # Claude Code configuration
│   ├── rules/         # Workspace behavior rules
│   ├── tools/         # Lifecycle-based capabilities
│   └── integrations/  # External tool connections
└── .arete/            # System-managed. Not user-edited directly.
    ├── memory/        # Decisions, learnings, observations, summaries.
    │   ├── items/     # Atomic: decisions.md, learnings.md, agent-observations.md
    │   └── summaries/ # Synthesized: collaboration.md, sessions.md
    └── activity/      # Activity log, session tracking.
\`\`\`

## Agent Mode: BUILDER vs GUIDE

Areté operates in two modes based on the \`agent_mode\` setting in \`arete.yaml\` (or \`AGENT_MODE\` environment variable):

- **BUILDER**: You are building Areté itself. Follow dev.mdc and testing.mdc. Put build memories in \`memory/entries/\` and MEMORY.md; PRDs in \`dev/prds/\`. Do not run \`arete seed test-data\` in this repo.
  
- **GUIDE**: You are helping a PM achieve arete. Use only product skills, skill router, and tools. Put user memories in \`.arete/memory/items/\`. Do not use build rules or \`dev/\`.

**If neither is set**: Infer from workspace structure (workspace with \`src/cli.ts\` and \`memory/MEMORY.md\` = builder; otherwise = guide).

## Memory Management

Areté uses a three-layer memory architecture:

- **L1 Resources** (Raw, immutable inputs): \`resources/meetings/\`, \`resources/notes/\`
- **L2 Items** (Extracted atomic facts): \`.arete/memory/items/\`
  - \`decisions.md\` - Key decisions with rationale and alternatives
  - \`learnings.md\` - Insights that inform future work
  - \`agent-observations.md\` - Observations about working with user
- **L3 Summaries** (Synthesized context): \`.arete/memory/summaries/\`
  - \`collaboration.md\` - How to work with user (synthesized from observations)
  - \`sessions.md\` - Work session tracking for continuity

**Important**: After significant actions, log to the appropriate memory file. Context only changes when work is finalized.

## Key CLI Commands

Essential Areté CLI commands for PM work:

- \`arete route "<query>"\` - Route user message to best skill and suggest model tier
- \`arete skill route "<query>"\` - Route to skill only (for agents before loading skill)
- \`arete brief --for "task" --skill <name>\` - Assemble primitive briefing (context + memory + entities)
- \`arete context --for "query"\` - Get relevant workspace files for a task
- \`arete memory search "query"\` - Search decisions, learnings, and observations
- \`arete resolve "reference"\` - Resolve ambiguous names (people, meetings, projects)
- \`arete people list\` - List people (optional \`--category internal|customers|users\`)
- \`arete people show <slug|email>\` - Show person details
- \`arete install\` - Initialize workspace structure
- \`arete status\` - Check workspace health
- \`arete pull\` - Sync from integrations (meetings, calendar)

## Version Information

Generated by Areté v${version} on ${timestamp}

For the latest documentation, run \`arete status\` or check AGENTS.md in the workspace root.
`;

    return {
      'CLAUDE.md': claudeMd,
    };
  }

  /**
   * Detect if Claude Code configuration exists in workspace
   * 
   * @param workspaceRoot - Absolute path to workspace root
   * @returns True if .claude/ directory exists
   */
  detectInWorkspace(workspaceRoot: string): boolean {
    return existsSync(join(workspaceRoot, '.claude'));
  }
}
