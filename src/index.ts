/**
 * Areté CLI - Main exports
 */

export * from './types.js';
export * from './core/config.js';
export * from './core/workspace.js';
export * from './core/utils.js';
export * from './core/scripts.js';

export * from './integrations/registry.js';

export { installCommand } from './commands/install.js';
export { setupCommand } from './commands/setup.js';
export { updateCommand } from './commands/update.js';
export { statusCommand } from './commands/status.js';
export { skillCommand } from './commands/skill.js';
export { integrationCommand } from './commands/integration.js';
export { fathomCommand } from './integrations/fathom/index.js';
export { seedCommand } from './commands/seed.js';
export { pullCommand } from './commands/pull.js';
