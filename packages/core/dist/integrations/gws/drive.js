/**
 * Drive provider — thin wrapper over the `gws` CLI for Google Drive operations.
 *
 * Drive API command paths:
 *   gws drive files list --params '{"q":"...","pageSize":N}'
 *   gws drive files get  --params '{"fileId":"..."}'
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
function mapDriveFile(raw) {
    const owners = [];
    if (Array.isArray(raw.owners)) {
        for (const owner of raw.owners) {
            if (typeof owner === 'string') {
                owners.push(owner);
            }
            else if (owner && typeof owner === 'object') {
                owners.push(owner.emailAddress ?? owner.displayName ?? 'unknown');
            }
        }
    }
    return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        mimeType: raw.mimeType ?? '',
        modifiedTime: raw.modifiedTime ?? '',
        owners,
        webViewLink: raw.webViewLink,
    };
}
// ---------------------------------------------------------------------------
// GwsDriveProvider class
// ---------------------------------------------------------------------------
export class GwsDriveProvider {
    name = 'drive';
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async isAvailable() {
        try {
            const result = await detectGws(this.deps);
            return result.installed && result.authenticated !== false;
        }
        catch {
            return false;
        }
    }
    async search(query, options) {
        const pageSize = options?.maxResults ?? 25;
        const raw = await gwsExec('drive', 'files list', { q: query, pageSize }, undefined, this.deps);
        const response = raw;
        if (Array.isArray(response)) {
            return response.map(mapDriveFile);
        }
        if (response && typeof response === 'object' && 'files' in response) {
            return (response.files ?? []).map(mapDriveFile);
        }
        if (response && typeof response === 'object' && 'id' in response) {
            return [mapDriveFile(response)];
        }
        return [];
    }
    async getFile(fileId) {
        const raw = await gwsExec('drive', 'files get', { fileId }, undefined, this.deps);
        return mapDriveFile(raw);
    }
    async getRecentFiles(options) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const iso = cutoff.toISOString();
        return this.search(`modifiedTime > '${iso}'`, options);
    }
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function getGwsDriveProvider(deps) {
    return new GwsDriveProvider(deps);
}
//# sourceMappingURL=drive.js.map