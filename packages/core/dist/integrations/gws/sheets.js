/**
 * Sheets provider — thin wrapper over the `gws` CLI for Google Sheets operations.
 *
 * Sheets API command paths:
 *   gws sheets spreadsheets get        --params '{"spreadsheetId":"..."}'
 *   gws sheets spreadsheets values get --params '{"spreadsheetId":"...","range":"Sheet1!A1:B2"}'
 */
import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
function mapSpreadsheet(raw) {
    const sheets = [];
    if (Array.isArray(raw.sheets)) {
        for (const s of raw.sheets) {
            const title = s.properties?.title;
            if (title)
                sheets.push(title);
        }
    }
    return {
        id: raw.spreadsheetId ?? '',
        title: raw.properties?.title ?? '',
        sheets,
    };
}
function mapRange(raw) {
    return {
        range: raw.range ?? '',
        values: raw.values ?? [],
    };
}
// ---------------------------------------------------------------------------
// GwsSheetsProvider class
// ---------------------------------------------------------------------------
export class GwsSheetsProvider {
    name = 'sheets';
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
    async getSpreadsheet(spreadsheetId) {
        const raw = await gwsExec('sheets', 'spreadsheets get', { spreadsheetId }, undefined, this.deps);
        return mapSpreadsheet(raw);
    }
    async getRange(spreadsheetId, range) {
        const raw = await gwsExec('sheets', 'spreadsheets values get', { spreadsheetId, range }, undefined, this.deps);
        return mapRange(raw);
    }
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function getGwsSheetsProvider(deps) {
    return new GwsSheetsProvider(deps);
}
//# sourceMappingURL=sheets.js.map