/**
 * Settings routes — /api/settings endpoints.
 * Manages the Anthropic API key stored in .credentials/anthropic-api-key.
 */
import { Hono } from 'hono';
import { join } from 'node:path';
import fs from 'node:fs/promises';
const API_KEY_FILE = '.credentials/anthropic-api-key';
export function createSettingsRouter(workspaceRoot) {
    const app = new Hono();
    // GET /api/settings/apikey — return { configured: boolean, maskedKey: string | null }
    app.get('/apikey', async (c) => {
        try {
            const filePath = join(workspaceRoot, API_KEY_FILE);
            let key = null;
            try {
                key = (await fs.readFile(filePath, 'utf8')).trim();
            }
            catch {
                // File doesn't exist — check env var as fallback
                const envKey = process.env['ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_OAUTH_TOKEN'];
                if (envKey)
                    key = envKey;
            }
            if (!key) {
                return c.json({ configured: false, maskedKey: null });
            }
            // Mask key: show first 16 chars + bullets
            const maskedKey = key.length > 20
                ? key.slice(0, 16) + '••••••••••••••••'
                : key.slice(0, 8) + '••••••••';
            return c.json({ configured: true, maskedKey });
        }
        catch (err) {
            console.error('[settings] get apikey error:', err);
            return c.json({ error: 'Failed to read API key status' }, 500);
        }
    });
    // POST /api/settings/apikey — body: { key: string }
    app.post('/apikey', async (c) => {
        try {
            const body = await c.req.json();
            const key = body.key?.trim();
            if (!key) {
                return c.json({ error: 'key is required' }, 400);
            }
            if (!key.startsWith('sk-ant-')) {
                return c.json({ error: 'Invalid API key format — must start with sk-ant-' }, 400);
            }
            const filePath = join(workspaceRoot, API_KEY_FILE);
            // Ensure .credentials directory exists
            await fs.mkdir(join(workspaceRoot, '.credentials'), { recursive: true });
            await fs.writeFile(filePath, key, 'utf8');
            // Apply immediately to running process
            process.env['ANTHROPIC_API_KEY'] = key;
            return c.json({ success: true });
        }
        catch (err) {
            console.error('[settings] post apikey error:', err);
            return c.json({ error: 'Failed to save API key' }, 500);
        }
    });
    // DELETE /api/settings/apikey — remove the key
    app.delete('/apikey', async (c) => {
        try {
            const filePath = join(workspaceRoot, API_KEY_FILE);
            try {
                await fs.unlink(filePath);
            }
            catch {
                // File doesn't exist — that's fine
            }
            // Clear from running process
            delete process.env['ANTHROPIC_API_KEY'];
            delete process.env['ANTHROPIC_OAUTH_TOKEN'];
            return c.json({ success: true });
        }
        catch (err) {
            console.error('[settings] delete apikey error:', err);
            return c.json({ error: 'Failed to remove API key' }, 500);
        }
    });
    return app;
}
