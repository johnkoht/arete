/**
 * Topic commands — list, show, refresh, lint
 *
 * The `arete topic` noun (mirrors `arete people`) surfaces the L3
 * topic-wiki layer: list all topics, view a single topic page, refresh
 * a topic's narrative from meetings that mention it, lint for stale /
 * stub / orphan topics.
 *
 * Seed (one-shot backfill from all meetings) is separate — see Step 8.
 */
import type { Command } from 'commander';
export declare function registerTopicCommands(program: Command): void;
//# sourceMappingURL=topic.d.ts.map