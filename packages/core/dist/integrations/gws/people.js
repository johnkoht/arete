/**
 * Directory / People provider — thin wrapper over the `gws` CLI for
 * Google Workspace directory lookups.
 *
 * Implements `DirectoryProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
function mapPerson(raw) {
    // Handle both nested Google People API shape and flat shape
    const email = raw.email ??
        raw.emailAddresses?.[0]?.value ??
        '';
    const name = raw.name ??
        raw.names?.[0]?.displayName ??
        '';
    const title = raw.title ??
        raw.organizations?.[0]?.title;
    const department = raw.department ??
        raw.organizations?.[0]?.department;
    const manager = raw.manager ??
        raw.relations?.find((r) => r.type === 'manager')?.person;
    const photoUrl = raw.photoUrl ??
        raw.photos?.[0]?.url;
    return { email, name, title, department, manager, photoUrl };
}
// ---------------------------------------------------------------------------
// GwsDirectoryProvider class
// ---------------------------------------------------------------------------
export class GwsDirectoryProvider {
    name = 'directory';
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
    async lookupPerson(email) {
        const raw = await gwsExec('people', 'get', { email }, undefined, this.deps);
        // Defensive: handle various response shapes
        if (!raw || typeof raw !== 'object')
            return null;
        const response = raw;
        // Check if the response has any person data
        const hasData = response.email ||
            response.emailAddresses?.length ||
            response.name ||
            response.names?.length;
        if (!hasData)
            return null;
        return mapPerson(response);
    }
    async searchDirectory(query, options) {
        const maxResults = options?.maxResults ?? 10;
        const raw = await gwsExec('people', 'search', { query, maxResults }, undefined, this.deps);
        // Defensive: handle various response shapes
        const response = raw;
        if (Array.isArray(response)) {
            return response.map(mapPerson);
        }
        if (response && typeof response === 'object' && 'people' in response) {
            return (response.people ?? []).map(mapPerson);
        }
        if (response && typeof response === 'object' && 'results' in response) {
            return (response.results ?? []).map(mapPerson);
        }
        // Single person or unrecognized shape
        if (response &&
            typeof response === 'object' &&
            ('email' in response || 'emailAddresses' in response)) {
            return [mapPerson(response)];
        }
        return [];
    }
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function getGwsDirectoryProvider(deps) {
    return new GwsDirectoryProvider(deps);
}
//# sourceMappingURL=people.js.map