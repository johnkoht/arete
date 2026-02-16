/**
 * Compatibility shims for legacy function APIs.
 * These delegate to the new service classes.
 */

export { getRelevantContext } from './context.js';
export { searchMemory } from './memory.js';
export { assembleBriefing, routeToSkill } from './intelligence.js';
export type { BriefingOptions } from './intelligence.js';
export {
  resolveEntity,
  resolveEntities,
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
  slugifyPersonName,
  PEOPLE_CATEGORIES,
} from './entity.js';
export type { ListPeopleOptions } from './entity.js';
