/**
 * Week-memory commands — durable interpretive overrides for the current week.
 *
 * Thin CLI wrapper over the core week-memory store
 * (`packages/core/src/services/week-memory.ts`). All parsing, id generation,
 * dedup, and persistence live in core; this layer only handles arg parsing,
 * `--type` validation, and human-vs-`--json` output formatting.
 *
 * Mirrors the structure of `commands/commitments.ts`: obtain the
 * StorageAdapter + workspace root via `createServices`, emit `{ success, ... }`
 * JSON under `--json`, and `process.exit(1)` on errors.
 */
import type { Command } from 'commander';
export declare function registerWeekMemoryCommand(program: Command): void;
//# sourceMappingURL=week-memory.d.ts.map