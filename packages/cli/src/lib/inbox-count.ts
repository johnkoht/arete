/**
 * Shared inbox item counting logic.
 * Used by status and pull commands.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

export interface InboxCounts {
  unprocessed: number;
  needsReview: number;
}

/**
 * Count inbox items by status.
 * Parses frontmatter from .md files in the inbox/ directory.
 * Files without frontmatter or without a status field count as unprocessed.
 */
export function countInboxItems(inboxDir: string): InboxCounts {
  if (!existsSync(inboxDir)) return { unprocessed: 0, needsReview: 0 };
  try {
    const files = readdirSync(inboxDir).filter(
      (f) => f.endsWith('.md') && f !== 'README.md',
    );
    let needsReview = 0;
    let triaged = 0;
    for (const file of files) {
      try {
        const content = readFileSync(join(inboxDir, file), 'utf8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
          const data = parseYaml(match[1]) as Record<string, unknown>;
          if (data['status'] === 'needs-review') needsReview++;
          else if (data['status'] === 'triaged') triaged++;
        }
      } catch { /* count as unprocessed */ }
    }
    const unprocessed = files.length - needsReview - triaged;
    return { unprocessed, needsReview };
  } catch {
    return { unprocessed: 0, needsReview: 0 };
  }
}
