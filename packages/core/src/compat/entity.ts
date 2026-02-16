/**
 * Compatibility shims for entity resolution and people management.
 * Delegates to EntityService for backward compatibility with existing CLI.
 */

import { FileStorageAdapter } from '../storage/file.js';
import { EntityService, slugifyPersonName, PEOPLE_CATEGORIES } from '../services/entity.js';
import type {
  WorkspacePaths,
  EntityType,
  ResolvedEntity,
  Person,
  PersonCategory,
} from '../models/index.js';

/**
 * Resolve an ambiguous reference to a workspace entity.
 * Delegates to EntityService.resolve.
 */
export async function resolveEntity(
  reference: string,
  type: EntityType,
  paths: WorkspacePaths
): Promise<ResolvedEntity | null> {
  const storage = new FileStorageAdapter();
  const service = new EntityService(storage);
  return service.resolve(reference, type, paths);
}

/**
 * Resolve an ambiguous reference and return all matching entities (ranked).
 * Delegates to EntityService.resolveAll.
 */
export async function resolveEntities(
  reference: string,
  type: EntityType,
  paths: WorkspacePaths,
  limit = 5
): Promise<ResolvedEntity[]> {
  const storage = new FileStorageAdapter();
  const service = new EntityService(storage);
  return service.resolveAll(reference, type, paths, limit);
}

export interface ListPeopleOptions {
  category?: PersonCategory;
}

/**
 * List all people in the workspace. Delegates to EntityService.listPeople.
 */
export async function listPeople(
  paths: WorkspacePaths | null,
  options: ListPeopleOptions = {}
): Promise<Person[]> {
  const storage = new FileStorageAdapter();
  const service = new EntityService(storage);
  return service.listPeople(paths, options);
}

/**
 * Get a person by category and slug. Delegates to EntityService.getPersonBySlug.
 */
export async function getPersonBySlug(
  paths: WorkspacePaths | null,
  category: PersonCategory,
  slug: string
): Promise<Person | null> {
  const storage = new FileStorageAdapter();
  const service = new EntityService(storage);
  return service.getPersonBySlug(paths, category, slug);
}

/**
 * Get a person by email. Delegates to EntityService.getPersonByEmail.
 */
export async function getPersonByEmail(
  paths: WorkspacePaths | null,
  email: string
): Promise<Person | null> {
  const storage = new FileStorageAdapter();
  const service = new EntityService(storage);
  return service.getPersonByEmail(paths, email);
}

/**
 * Regenerate people/index.md from all person files. Delegates to EntityService.buildPeopleIndex.
 */
export async function updatePeopleIndex(paths: WorkspacePaths | null): Promise<void> {
  const storage = new FileStorageAdapter();
  const service = new EntityService(storage);
  return service.buildPeopleIndex(paths);
}

export { slugifyPersonName, PEOPLE_CATEGORIES };
