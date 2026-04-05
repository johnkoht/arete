/**
 * Drive provider — thin wrapper over the `gws` CLI for Google Drive operations.
 *
 * Implements `DriveProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
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
        const maxResults = options?.maxResults ?? 25;
        const raw = await gwsExec('drive', 'files', { q: query, maxResults }, undefined, this.deps);
        // Defensive: handle various response shapes
        const response = raw;
        if (Array.isArray(response)) {
            return response.map(mapDriveFile);
        }
        if (response && typeof response === 'object' && 'files' in response) {
            return (response.files ?? []).map(mapDriveFile);
        }
        // Single file or unrecognized shape
        if (response && typeof response === 'object' && 'id' in response) {
            return [mapDriveFile(response)];
        }
        return [];
    }
    async getFile(fileId) {
        const raw = await gwsExec('drive', 'files', { fileId }, undefined, this.deps);
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