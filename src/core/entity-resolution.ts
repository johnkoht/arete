/**
 * Entity Resolution Service — Intelligence Layer (Phase 3)
 *
 * Delegates to @arete/core EntityService for compatibility.
 * See packages/core/src/compat/entity.ts
 */

export {
  resolveEntity,
  resolveEntities,
  slugifyPersonName,
} from '@arete/core';
