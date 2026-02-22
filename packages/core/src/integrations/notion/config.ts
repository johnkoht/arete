/**
 * Notion integration configuration and credential loading.
 */

import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../../storage/adapter.js';

/** Notion API base URL */
export const NOTION_API_BASE = 'https://api.notion.com';

/** Credential key in credentials.yaml (top-level YAML key) */
export const NOTION_CREDENTIAL_KEY = 'notion';

/** Credential field under the key (nested field name) */
export const NOTION_CREDENTIAL_FIELD = 'api_key';

/**
 * Load Notion API key from env var or credentials.yaml.
 *
 * Priority: NOTION_API_KEY env var → credentials.yaml notion.api_key
 */
export async function loadNotionApiKey(
  storage: StorageAdapter,
  workspaceRoot: string | null
): Promise<string | null> {
  const fromEnv = process.env.NOTION_API_KEY;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (!workspaceRoot) return null;

  const { join } = await import('path');
  const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
  const exists = await storage.exists(credPath);
  if (!exists) return null;

  const content = await storage.read(credPath);
  if (!content) return null;
  try {
    const creds = parseYaml(content) as Record<string, Record<string, string>>;
    const key = creds?.[NOTION_CREDENTIAL_KEY]?.[NOTION_CREDENTIAL_FIELD];
    return key?.trim() ?? null;
  } catch {
    return null;
  }
}
