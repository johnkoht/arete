/**
 * Cursor IDE Adapter
 * 
 * Implements IDE adapter for Cursor IDE, preserving current workspace structure,
 * rule formatting behavior, and AGENTS.md generation with mandatory routing workflow.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { IDEAdapter, CanonicalRule, IDETarget } from '../ide-adapter.js';
import type { AreteConfig } from '../../types.js';

/**
 * Cursor IDE Adapter
 * 
 * Provides Cursor-specific behavior:
 * - .cursor/ configuration directory
 * - .mdc file extension for rules
 * - YAML frontmatter format for rule metadata
 * - No path transformations (baseline behavior)
 * - AGENTS.md root file generation with mandatory routing workflow
 */
export class CursorAdapter implements IDEAdapter {
  readonly target: IDETarget = 'cursor';
  readonly configDirName = '.cursor';
  readonly ruleExtension = '.mdc';

  /**
   * Get all Cursor-specific directory paths
   */
  getIDEDirs(): string[] {
    return [
      '.cursor',
      '.cursor/rules',
      '.cursor/tools',
      '.cursor/integrations',
      '.cursor/integrations/configs',
    ];
  }

  /**
   * Get rules directory path
   */
  rulesDir(): string {
    return '.cursor/rules';
  }

  /**
   * Get tools directory path
   */
  toolsDir(): string {
    return '.cursor/tools';
  }

  /**
   * Get integrations directory path
   */
  integrationsDir(): string {
    return '.cursor/integrations';
  }

  /**
   * Format a canonical rule as Cursor .mdc with YAML frontmatter
   * 
   * @param rule - Canonical rule representation
   * @param config - Areté configuration (unused by Cursor adapter)
   * @returns Formatted .mdc content with YAML frontmatter
   */
  formatRule(rule: CanonicalRule, config: AreteConfig): string {
    const frontmatter: Record<string, any> = {
      description: rule.description,
    };

    if (rule.globs && rule.globs.length > 0) {
      frontmatter.globs = rule.globs;
    }

    if (rule.alwaysApply === true) {
      frontmatter.alwaysApply = true;
    }

    // Build YAML frontmatter
    const yamlLines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        yamlLines.push(`${key}: ${JSON.stringify(value)}`);
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
   * Transform rule content for Cursor
   * 
   * No transformation needed - Cursor uses canonical paths.
   * 
   * @param content - Original rule content
   * @returns Unchanged content
   */
  transformRuleContent(content: string): string {
    return content;
  }

  /**
   * Generate Cursor-specific root files
   *
   * Creates AGENTS.md with:
   * 1. Project overview (what Areté is)
   * 2. Mandatory routing workflow (inlined from routing-mandatory.mdc)
   * 3. Workspace structure
   * 4. Key CLI commands
   * 5. Version and timestamp
   *
   * @param config - Areté configuration (for version)
   * @param workspaceRoot - Workspace root path (unused; kept for interface)
   * @param sourceRulesDir - Optional path to canonical rules dir (runtime/rules or dist/rules)
   * @returns Map with AGENTS.md content
   */
  generateRootFiles(
    config: AreteConfig,
    workspaceRoot: string,
    sourceRulesDir?: string
  ): Record<string, string> {
    const timestamp = new Date().toISOString();
    const version = config.version || '1.0.0';

    // Read routing-mandatory.mdc content to inline
    // Fallback content if file doesn't exist or can't be read
    const fallbackRouting = `# 🛑 STOP - READ THIS FIRST

Before responding to ANY user request in this Areté workspace:

## Is this a PM action?

Tour/orientation ("give me a tour", "how does this work"), meeting prep, planning, synthesis, discovery, PRD, roadmap, competitive analysis, process meetings, etc.

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

    const agentsMd = `# Areté - Product Builder's Operating System

You are an AI assistant operating in Areté, a Product Management workspace. This workspace helps PMs streamline their workflows through structured context, project-based work, and institutional memory.

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

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
├── .cursor/           # Cursor IDE configuration
│   ├── rules/         # Workspace behavior rules
│   ├── tools/         # Lifecycle-based capabilities
│   └── integrations/  # External tool connections
└── .arete/            # System-managed. Not user-edited directly.
    ├── memory/        # Decisions, learnings, observations, summaries.
    │   ├── items/     # Atomic: decisions.md, learnings.md, agent-observations.md
    │   └── summaries/ # Synthesized: collaboration.md, sessions.md
    └── activity/      # Activity log, session tracking.
\`\`\`

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
- \`arete status\` - Check workspace health
- \`arete pull\` - Sync from integrations (meetings, calendar)

## Full Rules

For complete workspace rules and guidance, see \`.cursor/rules/\`. Key rules:
- \`pm-workspace.mdc\` - Main workspace behavior and PM actions
- \`routing-mandatory.mdc\` - Mandatory routing workflow (inlined above)
- \`agent-memory.mdc\` - Memory management guidance

## Version Information

Generated by Areté v${version} on ${timestamp}
`;

    return {
      'AGENTS.md': agentsMd,
    };
  }

  /**
   * Detect if Cursor configuration exists in workspace
   * 
   * @param workspaceRoot - Absolute path to workspace root
   * @returns True if .cursor/ directory exists
   */
  detectInWorkspace(workspaceRoot: string): boolean {
    return existsSync(join(workspaceRoot, '.cursor'));
  }
}
