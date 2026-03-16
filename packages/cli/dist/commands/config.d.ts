/**
 * arete config — View and modify AI configuration
 *
 * Commands:
 *   arete config show ai                      - Display full AI config
 *   arete config set ai.tiers.<tier> <model>  - Set tier model
 *   arete config set ai.tasks.<task> <tier>   - Set task-to-tier mapping
 */
import type { Command } from 'commander';
export declare function registerConfigCommand(program: Command): void;
//# sourceMappingURL=config.d.ts.map