/**
 * Krisp credential helpers.
 *
 * Reads and writes the `krisp:` section of `.credentials/credentials.yaml`.
 * All writes are atomic merges — existing credentials (fathom, slack, etc.) are preserved.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
/**
 * Load Krisp credentials from `.credentials/credentials.yaml`.
 * Returns all 5 fields or null if the `krisp:` section is missing or incomplete.
 */
export async function loadKrispCredentials(storage, workspaceRoot) {
    const { join } = await import('path');
    const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
    const exists = await storage.exists(credPath);
    if (!exists)
        return null;
    const content = await storage.read(credPath);
    if (!content)
        return null;
    let parsed;
    try {
        parsed = parseYaml(content);
    }
    catch {
        return null;
    }
    const krisp = parsed?.krisp;
    if (!krisp || typeof krisp !== 'object')
        return null;
    const k = krisp;
    const client_id = k.client_id;
    const client_secret = k.client_secret;
    const access_token = k.access_token;
    const refresh_token = k.refresh_token;
    const expires_at = k.expires_at;
    if (typeof client_id !== 'string' || !client_id.trim() ||
        typeof client_secret !== 'string' || !client_secret.trim() ||
        typeof access_token !== 'string' || !access_token.trim() ||
        typeof refresh_token !== 'string' || !refresh_token.trim() ||
        typeof expires_at !== 'number') {
        return null;
    }
    return { client_id, client_secret, access_token, refresh_token, expires_at };
}
/**
 * Save Krisp credentials to `.credentials/credentials.yaml`.
 *
 * Reads the existing file first, merges the `krisp:` section into the full
 * object, and writes the entire file in one operation. Existing credentials
 * (fathom, slack, calendar, etc.) are preserved.
 */
export async function saveKrispCredentials(storage, workspaceRoot, creds) {
    const { join } = await import('path');
    const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
    let existing = {};
    const exists = await storage.exists(credPath);
    if (exists) {
        const content = await storage.read(credPath);
        if (content) {
            try {
                const parsed = parseYaml(content);
                if (parsed && typeof parsed === 'object') {
                    existing = parsed;
                }
            }
            catch {
                // If YAML is malformed, start fresh but keep what we can
            }
        }
    }
    const merged = {
        ...existing,
        krisp: {
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            access_token: creds.access_token,
            refresh_token: creds.refresh_token,
            expires_at: creds.expires_at,
        },
    };
    await storage.write(credPath, stringifyYaml(merged));
}
//# sourceMappingURL=config.js.map