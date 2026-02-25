/**
 * Deduplication checking for meetings and similar content.
 *
 * Ported from scripts/integrations/utils.py
 * Uses fs directly as specified for utility layer.
 */
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
export declare function checkDuplicate(directory: string, meetingId?: string | null, filename?: string | null): Promise<boolean>;
//# sourceMappingURL=dedup.d.ts.map