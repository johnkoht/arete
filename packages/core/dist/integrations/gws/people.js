/**
 * Directory / People provider — thin wrapper over the `gws` CLI for
 * Google Workspace directory lookups.
 *
 * People API command paths:
 *   gws people people searchContacts        --params '{"query":"...","readMask":"emailAddresses,names,organizations,photos","pageSize":N}'
 *   gws people people searchDirectoryPeople --params '{"query":"...","readMask":"emailAddresses,names,organizations,photos","sources":[...],"pageSize":N}'
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
function mapPerson(raw) {
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
const PERSON_READ_MASK = 'emailAddresses,names,organizations,photos';
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
        const raw = await gwsExec('people', 'people searchContacts', { query: email, readMask: PERSON_READ_MASK, pageSize: 1 }, undefined, this.deps);
        if (!raw || typeof raw !== 'object')
            return null;
        // searchContacts returns { results: [...] } or { people: [...] }
        const response = raw;
        const people = response.results ?? response.people ?? [];
        if (people.length === 0)
            return null;
        const person = mapPerson(people[0]);
        return person.email || person.name ? person : null;
    }
    async searchDirectory(query, options) {
        const pageSize = options?.maxResults ?? 10;
        const raw = await gwsExec('people', 'people searchDirectoryPeople', {
            query,
            readMask: PERSON_READ_MASK,
            sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
            pageSize,
        }, undefined, this.deps);
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