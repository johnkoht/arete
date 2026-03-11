/**
 * Compatibility shims for entity resolution and people management.
 * Delegates to EntityService for backward compatibility with existing CLI.
 */
import { slugifyPersonName, PEOPLE_CATEGORIES } from '../services/entity.js';
import type { WorkspacePaths, EntityType, ResolvedEntity, Person, PersonCategory } from '../models/index.js';
/**
 * Resolve an ambiguous reference to a workspace entity.
 * Delegates to EntityService.resolve.
 */
export declare function resolveEntity(reference: string, type: EntityType, paths: WorkspacePaths): Promise<ResolvedEntity | null>;
/**
 * Resolve an ambiguous reference and return all matching entities (ranked).
 * Delegates to EntityService.resolveAll.
 */
export declare function resolveEntities(reference: string, type: EntityType, paths: WorkspacePaths, limit?: number): Promise<ResolvedEntity[]>;
export interface ListPeopleOptions {
    category?: PersonCategory;
}
/**
 * List all people in the workspace. Delegates to EntityService.listPeople.
 */
export declare function listPeople(paths: WorkspacePaths | null, options?: ListPeopleOptions): Promise<Person[]>;
/**
 * Get a person by category and slug. Delegates to EntityService.getPersonBySlug.
 */
export declare function getPersonBySlug(paths: WorkspacePaths | null, category: PersonCategory, slug: string): Promise<Person | null>;
/**
 * Get a person by email. Delegates to EntityService.getPersonByEmail.
 */
export declare function getPersonByEmail(paths: WorkspacePaths | null, email: string): Promise<Person | null>;
/**
 * Regenerate people/index.md from all person files. Delegates to EntityService.buildPeopleIndex.
 */
export declare function updatePeopleIndex(paths: WorkspacePaths | null): Promise<void>;
export { slugifyPersonName, PEOPLE_CATEGORIES };
//# sourceMappingURL=entity.d.ts.map