/**
 * Deduplication checking for meetings and similar content.
 *
 * Ported from scripts/integrations/utils.py
 * Uses fs directly as specified for utility layer.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Check if a meeting already exists in the directory.
 *
 * Checks by:
 * 1. Exact filename match
 * 2. Meeting ID in file metadata (if meetingId provided)
 *
 * @param directory - Directory to check
 * @param meetingId - Optional meeting ID to search for in metadata
 * @param filename - Optional filename to check for
 * @returns True if duplicate exists, false otherwise
 */
export async function checkDuplicate(
  directory: string,
  meetingId?: string | null,
  filename?: string | null
): Promise<boolean> {
  try {
    const dirStat = await stat(directory);
    if (!dirStat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  // Check exact filename
  if (filename) {
    try {
      const filePath = join(directory, filename);
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        return true;
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  // Check meeting ID in existing files
  if (meetingId) {
    try {
      const files = await readdir(directory);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      for (const file of mdFiles) {
        try {
          const content = await readFile(join(directory, file), 'utf-8');
          if (content.includes(`**Meeting ID**: ${meetingId}`)) {
            return true;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return false;
}
