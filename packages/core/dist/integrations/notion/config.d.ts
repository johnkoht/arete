/**
 * Notion integration configuration and credential loading.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
/** Notion API base URL */
export declare const NOTION_API_BASE = "https://api.notion.com";
/** Credential key in credentials.yaml (top-level YAML key) */
export declare const NOTION_CREDENTIAL_KEY = "notion";
/** Credential field under the key (nested field name) */
export declare const NOTION_CREDENTIAL_FIELD = "api_key";
/**
 * Load Notion API key from env var or credentials.yaml.
 *
 * Priority: NOTION_API_KEY env var → credentials.yaml notion.api_key
 */
export declare function loadNotionApiKey(storage: StorageAdapter, workspaceRoot: string | null): Promise<string | null>;
//# sourceMappingURL=config.d.ts.map