/**
 * Generates CLAUDE.md content for Arete PM workspaces.
 *
 * Pure function — no I/O, no side effects.
 */
import type { AreteConfig } from '../models/workspace.js';
import type { SkillDefinition } from '../models/skills.js';
import type { MemorySummary } from '../models/memory-summary.js';
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
export declare function generateClaudeMd(config: AreteConfig, skills: SkillDefinition[], memory?: MemorySummary): string;
//# sourceMappingURL=claude-md.d.ts.map