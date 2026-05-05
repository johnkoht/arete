/**
 * Skills-local seeding (Phase 2 — chef-orchestrator APPEND-file convention).
 *
 * `.arete/skills-local/<skill-slug>.md` files give the user a per-skill
 * APPEND surface — free-form guidance the chef-orchestrator agent reads
 * at the start of every skill run. Seeded on `arete install` and
 * `arete update`. Idempotent: never overwrites existing user content.
 *
 * The five Phase 2 chef-orchestrator skills are seeded by default:
 *   - daily-winddown
 *   - weekly-winddown
 *   - week-plan
 *   - process-meetings
 *   - meeting-prep
 *
 * If a skill file already exists at `.arete/skills-local/<slug>.md`,
 * it is preserved verbatim. Only missing files are seeded.
 *
 * Phase 3 transition note: when the skills directory split ships,
 * these files migrate naturally to `.agents/skills/<slug>/APPEND.md`
 * (or similar) as part of the user-skill dir. No data loss.
 */
import type { StorageAdapter } from '../storage/adapter.js';
/** Skills that get an APPEND-file template seeded by Phase 2. */
export declare const PHASE_2_CHEF_ORCHESTRATOR_SKILLS: readonly ["daily-winddown", "weekly-winddown", "week-plan", "process-meetings", "meeting-prep"];
export type ChefOrchestratorSkillSlug = (typeof PHASE_2_CHEF_ORCHESTRATOR_SKILLS)[number];
/**
 * Render the seed template for a given skill slug.
 *
 * The template is the same for all five skills, customized only by the
 * skill name in the heading. Comments inside HTML comments give the
 * user examples without polluting the rendered file.
 */
export declare function renderSkillsLocalTemplate(slug: string): string;
/**
 * Result of seedSkillsLocal — which files were seeded and which were preserved.
 */
export interface SeedSkillsLocalResult {
    /** Files newly created (relative to workspace root). */
    added: string[];
    /** Files preserved (already existed; verbatim untouched). */
    preserved: string[];
}
/**
 * Seed `.arete/skills-local/<slug>.md` for each Phase 2 chef-orchestrator
 * skill. Idempotent: if a file already exists at the destination, it is
 * preserved untouched. Only missing files are written.
 *
 * Caller is responsible for creating `.arete/skills-local/` directory
 * (handled via BASE_WORKSPACE_DIRS in workspace-structure.ts).
 */
export declare function seedSkillsLocal(storage: StorageAdapter, workspaceRoot: string, options?: {
    /** Override which skills get seeded (defaults to all Phase 2 chef skills). */
    skills?: readonly string[];
}): Promise<SeedSkillsLocalResult>;
//# sourceMappingURL=skills-local.d.ts.map