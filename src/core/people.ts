/**
 * People service – list, get, and index people from workspace person files.
 *
 * Delegates to @arete/core EntityService for compatibility.
 * See packages/core/src/compat/entity.ts
 */

export {
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
  slugifyPersonName,
  PEOPLE_CATEGORIES,
} from '@arete/core';
export type { ListPeopleOptions } from '@arete/core';
