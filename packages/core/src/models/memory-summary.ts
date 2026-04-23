/**
 * MemorySummary — workspace-state snapshot passed to the CLAUDE.md
 * generator (and future consumers). Lives at the model layer, NOT
 * services or generators, to avoid cyclic/inverted imports:
 *
 *   generators → models ← services
 *
 * Initial shape is just active topics; future fields (active areas,
 * week focus, recent decisions for boot context) extend the interface
 * as those surfaces land.
 */

import type { ActiveTopicEntry } from './active-topics.js';

export interface MemorySummary {
  activeTopics: ActiveTopicEntry[];
  // Future:
  //   activeAreas?: ActiveAreaEntry[];
  //   weekFocus?: string;
}
