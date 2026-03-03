/**
 * Integration section generation utilities.
 *
 * Pure functions for generating, injecting, and deriving skill integration profiles.
 * All paths are workspace-relative; no skill-relative or absolute paths are used.
 */
import type { SkillIntegration, SkillDefinition } from '../models/index.js';
/**
 * Generate the markdown content for the ## Areté Integration section.
 * Returns null if no meaningful integration (all outputs type:none, empty, or undefined).
 *
 * The returned string is the section content WITHOUT sentinel markers.
 * Use injectIntegrationSection() to embed it in a SKILL.md file.
 */
export declare function generateIntegrationSection(skillId: string, integration: SkillIntegration): string | null;
/**
 * Inject (or replace) the ## Areté Integration section into SKILL.md content.
 * Uses sentinel markers for idempotent replacement.
 *
 * Behavior:
 * - Markers found + section provided: replace everything between markers (inclusive)
 * - Markers NOT found + section provided: append markers + section at end
 * - Markers found + section null: remove markers and enclosed content
 * - Markers NOT found + section null: return content unchanged
 * - Idempotent: inject(inject(content, section), section) === inject(content, section)
 */
export declare function injectIntegrationSection(skillMdContent: string, section: string | null): string;
/**
 * Derive a SkillIntegration from legacy fields (createsProject, projectTemplate).
 * Returns undefined if no legacy fields are present.
 *
 * This is specifically for native skills that use the old createsProject/projectTemplate
 * pattern and don't yet have an explicit integration field.
 */
export declare function deriveIntegrationFromLegacy(def: SkillDefinition): SkillIntegration | undefined;
//# sourceMappingURL=integration.d.ts.map