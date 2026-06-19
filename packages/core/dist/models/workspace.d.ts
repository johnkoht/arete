/**
 * Workspace domain types.
 *
 * Imports from common.ts ONLY.
 */
import type { AgentMode } from './common.js';
/** Supported IDE targets */
export type IDETarget = 'cursor' | 'claude';
/** AI task types for tier routing */
export type AITask = 'summary' | 'extraction' | 'decision_extraction' | 'learning_extraction' | 'significance_analysis' | 'reconciliation' | 'synthesis' | 'brief'
/** Phase 11 11a — Gmail Sent auto-resolution cross-check (fast tier, eng MC2). */
 | 'external_resolution';
/** AI tier levels */
export type AITier = 'fast' | 'standard' | 'frontier';
/** AI configuration section */
export type AIConfig = {
    /** Model tier configuration: tier name → model ID */
    tiers?: {
        fast?: string;
        standard?: string;
        frontier?: string;
    };
    /** Task-to-tier routing: task → tier */
    tasks?: Partial<Record<AITask, AITier>>;
};
/** Intelligence extraction configuration */
export type IntelligenceConfig = {
    extraction?: {
        /** Items above this confidence threshold are auto-approved (default: 0.8) */
        confidence_threshold_approved?: number;
        /** Items below this confidence threshold are filtered out (default: 0.5) */
        confidence_threshold_include?: number;
        /** Jaccard similarity threshold for deduplication (default: 0.7) */
        dedup_jaccard_threshold?: number;
    };
};
/** QMD collection scope identifiers */
export type QmdScope = 'all' | 'memory' | 'meetings' | 'context' | 'projects' | 'people' | 'areas' | 'goals' | 'now' | 'resources' | 'inbox';
/** Map of scope to collection name. Partial because some scopes may be skipped if path doesn't exist. */
export type QmdCollections = Partial<Record<QmdScope, string>>;
/**
 * Extraction pipeline mode (single-pass-extraction plan, W1/W2).
 * - 'legacy' (default): accreted harness — caps, regex filters, exclusion list.
 * - 'single_pass': judgment-first single pass — tiers, ⚠ channel,
 *   direction:none, open questions, mark-don't-skip prior items; mechanical
 *   detectors flip to telemetry-only.
 * Legacy behavior is bit-identical when this is absent or 'legacy'.
 */
export type ExtractionPipelineMode = 'legacy' | 'single_pass';
/**
 * Cross-meeting reconcile placement (chef-holistic-reconcile plan, W0).
 * - 'inline' (default): `--reconcile` runs per-file at extract time (today).
 * - 'day-level': extract skips inline cross-meeting reconcile; the winddown
 *   runs ONE `arete meeting reconcile-day` call over the whole day at Step 2.
 */
export type ReconcileMode = 'inline' | 'day-level';
/**
 * Winddown render mode (winddown-approval-doc plan, W1).
 * - 'prose' (default): today's narrative `## Stage for approval` doc —
 *   BYTE-IDENTICAL to pre-feature winddown (AC6 invariant).
 * - 'checklist': the checkbox approval surface — per-meeting `### Action items
 *   / Decisions / Learnings` checkboxes pre-filled from tier+status, Your-call
 *   blocks for uncertain items, proposed-action checkboxes with editable
 *   bodies, hidden anchors per line, and a persisted baseline for `/winddown
 *   apply` round-trip.
 * Absent or 'prose' ⇒ the checklist renderer is never invoked.
 */
export type WinddownRenderMode = 'prose' | 'checklist' | 'theme';
/** Shape of the resolved config object */
export type AreteConfig = {
    schema: number;
    version: string | null;
    source: string;
    created?: string;
    /** Extraction pipeline mode — see ExtractionPipelineMode. Default 'legacy'. */
    extraction_mode?: ExtractionPipelineMode;
    /** Cross-meeting reconcile placement — see ReconcileMode. Default 'inline'. */
    reconcile_mode?: ReconcileMode;
    /** Winddown render mode — see WinddownRenderMode. Default 'prose' (AC6). */
    winddown_render?: WinddownRenderMode;
    /**
     * CHR W7 shadow-soak instrumentation (chef-holistic-reconcile plan).
     * When true, `meeting extract` persists a RAW pre-reconcile extraction
     * snapshot to `dev/diary/raw-extractions/` (gitignored) before any
     * reconcile/dedup mutation, and shadow-engine runs append to
     * `dev/diary/reconcile-shadow.log`. Default false — zero writes, legacy
     * behavior bit-identical.
     */
    reconcile_shadow?: boolean;
    /** Agent mode: builder (building Areté) or guide (end-user workspace) */
    agent_mode?: AgentMode;
    /** Target IDE: cursor or claude */
    ide_target?: IDETarget;
    /** Internal email domain for classifying meeting attendees */
    internal_email_domain?: string;
    /** QMD collection name for this workspace (auto-generated on install) */
    qmd_collection?: string;
    /** QMD collections for scoped search (scope → collection name) */
    qmd_collections?: QmdCollections;
    /** AI configuration for model routing and tiers */
    ai?: AIConfig;
    /** Intelligence extraction configuration */
    intelligence?: IntelligenceConfig;
    skills: {
        core: string[];
        overrides: string[];
        /** Role-to-skill mapping: default skill name -> preferred replacement */
        defaults?: Record<string, string | null>;
    };
    tools: string[];
    integrations: Record<string, unknown> & {
        /** Calendar integration configuration */
        calendar?: {
            provider: string;
            calendars?: string[];
        };
    };
    settings: {
        memory: {
            decisions: {
                prompt_before_save: boolean;
            };
            learnings: {
                prompt_before_save: boolean;
            };
        };
        conversations: {
            /** Controls whether participants are mapped to the people directory after capture. */
            peopleProcessing: 'off' | 'ask' | 'on';
        };
    };
};
/** Return type of getWorkspacePaths() */
export type WorkspacePaths = {
    root: string;
    manifest: string;
    ideConfig: string;
    rules: string;
    /**
     * User-customization skills directory: `.agents/skills`. Skills the user
     * has forked or hand-authored live here. Takes precedence at agent-load
     * time over `managedSkills`. Survives `arete update`.
     *
     * Pre-Phase-3 workspaces also had shipped skills written here on install
     * + update; the migration treats unforked legacy entries as
     * "user-tracked-upstream" rather than forks (see `skill-resolver` two-tier
     * resolver).
     */
    agentSkills: string;
    /**
     * Managed skills directory: `.arete/skills`. Areté's shipped skills are
     * written here on `arete install` and refreshed on `arete update`. Treated
     * as read-only by convention. Phase 3 Step 1.
     */
    managedSkills: string;
    tools: string;
    integrations: string;
    context: string;
    /** Canonical memory path: .arete/memory */
    memory: string;
    now: string;
    goals: string;
    projects: string;
    resources: string;
    people: string;
    credentials: string;
    templates: string;
};
/** Status of a workspace */
export type WorkspaceStatus = {
    initialized: boolean;
    version: string | null;
    ideTarget?: IDETarget;
    agentMode?: AgentMode;
    errors: string[];
};
/** Options for creating a new workspace */
export type CreateWorkspaceOptions = {
    ideTarget?: IDETarget;
    agentMode?: AgentMode;
    source?: string;
    skipInstall?: boolean;
    /** Package root for resolving symlink/local sources. Required when source is 'symlink'. */
    packageRoot?: string;
    /** Pre-resolved source paths (skills, rules, tools, etc.). When provided, used for copying. */
    sourcePaths?: SourcePaths;
};
/** Result of an install operation */
export type InstallResult = {
    directories: string[];
    files: string[];
    skills: string[];
    tools: string[];
    rules: string[];
    errors: Array<{
        type: string;
        path: string;
        error: string;
    }>;
};
/** Result of an update operation */
export type UpdateResult = {
    added: string[];
    updated: string[];
    preserved: string[];
    removed: string[];
    /**
     * Phase 3.5 A2/A3/A4/B1 — opportunistic cleanups during
     * `migratePreSplitAgentSkills`: stale `SKILL.legacy.md` files
     * removed (A2), byte-equal aux files dedup'd from
     * `.agents/skills/<name>/` (A3), empty user-skill dirs pruned (A4),
     * and `.fork-base/` auto-recorded from git history (B1). Each entry
     * is a per-cleanup record so the CLI can surface counts in the
     * update summary.
     */
    cleaned?: Array<{
        name: string;
        kind: 'legacy_skill' | 'aux_dedup' | 'empty_dir' | 'auto_fork_base';
        path: string;
    }>;
};
/** Options for workspace update */
export type UpdateWorkspaceOptions = {
    /** Pre-resolved source paths used to sync canonical runtime assets (skills/rules/tools). */
    sourcePaths?: SourcePaths;
    /** Override IDE target (useful for adding a second IDE without changing arete.yaml). */
    ideTarget?: 'cursor' | 'claude';
    /**
     * Optional pre-loaded memory summary threaded into `CLAUDE.md`
     * regeneration during update. When present, the Active Topics
     * section is preserved across npm version bumps. When absent, the
     * section is stripped (the topic-wiki-memory plan makes this a
     * must — callers should load memory via `loadMemorySummary` before
     * calling update).
     */
    memorySummary?: import('./memory-summary.js').MemorySummary;
};
/** Return type of parseSourceType() */
export type SourceType = {
    type: 'npm' | 'symlink' | 'local';
    path: string | null;
};
/** Source paths from the CLI package */
export type SourcePaths = {
    root: string;
    skills: string;
    tools: string;
    rules: string;
    integrations: string;
    templates: string;
    /** Path to GUIDE.md file in the runtime/dist package */
    guide: string;
    /** Path to UPDATES.md file in the runtime/dist package (release notes) */
    updates: string;
    /** Path to agent profiles directory in the runtime package */
    profiles?: string;
};
//# sourceMappingURL=workspace.d.ts.map