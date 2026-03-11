/**
 * Conversation save logic — uses StorageAdapter, no direct fs.
 * Follows saveMeetingFile() pattern from ../meetings.ts.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { ConversationForSave } from './types.js';
/**
 * Generate a filename for a conversation artifact.
 * Format: {date}-{title-slug}.md
 */
export declare function conversationFilename(conversation: ConversationForSave): string;
/**
 * Save a conversation artifact to disk as a markdown file.
 *
 * @returns The full path of the saved file, or null if the file already exists (and force is false).
 */
export declare function saveConversationFile(storage: StorageAdapter, conversation: ConversationForSave, outputDir: string, options?: {
    force?: boolean;
}): Promise<string | null>;
/**
 * Patch the `participant_ids` field in a saved conversation file's YAML frontmatter.
 *
 * Uses string-level replacement (not YAML round-trip) to preserve all other content.
 * Inserts the field before the closing `---` if not already present.
 * No-op if the file doesn't exist or has no recognizable frontmatter.
 * Never throws.
 */
export declare function updateConversationFrontmatter(storage: StorageAdapter, filePath: string, participantIds: string[]): Promise<void>;
//# sourceMappingURL=save.d.ts.map