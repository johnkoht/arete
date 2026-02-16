// @arete/core - Intelligence and service layer
export const VERSION = '0.1.0';

// Model type definitions
export * from './models/index.js';

// Storage interface
export * from './storage/index.js';

// Search types
export * from './search/index.js';

// Services
export * from './services/index.js';

// Utilities
export * from './utils/index.js';

// Compatibility shims (legacy function APIs)
export { getRelevantContext, searchMemory } from './compat/index.js';
