/**
 * Compatibility shims for entity resolution and people management.
 * Delegates to EntityService for backward compatibility with existing CLI.
 */
import { FileStorageAdapter } from '../storage/file.js';
import { EntityService, slugifyPersonName, PEOPLE_CATEGORIES } from '../services/entity.js';
/**
 * Resolve an ambiguous reference to a workspace entity.
 * Delegates to EntityService.resolve.
 */
export async function resolveEntity(reference, type, paths) {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage);
    return service.resolve(reference, type, paths);
}
/**
 * Resolve an ambiguous reference and return all matching entities (ranked).
 * Delegates to EntityService.resolveAll.
 */
export async function resolveEntities(reference, type, paths, limit = 5) {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage);
    return service.resolveAll(reference, type, paths, limit);
}
/**
 * List all people in the workspace. Delegates to EntityService.listPeople.
 */
export async function listPeople(paths, options = {}) {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage);
    return service.listPeople(paths, options);
}
/**
 * Get a person by category and slug. Delegates to EntityService.getPersonBySlug.
 */
export async function getPersonBySlug(paths, category, slug) {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage);
    return service.getPersonBySlug(paths, category, slug);
}
/**
 * Get a person by email. Delegates to EntityService.getPersonByEmail.
 */
export async function getPersonByEmail(paths, email) {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage);
    return service.getPersonByEmail(paths, email);
}
/**
 * Regenerate people/index.md from all person files. Delegates to EntityService.buildPeopleIndex.
 */
export async function updatePeopleIndex(paths) {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage);
    return service.buildPeopleIndex(paths);
}
export { slugifyPersonName, PEOPLE_CATEGORIES };
//# sourceMappingURL=entity.js.map