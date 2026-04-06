/**
 * Sheets provider — thin wrapper over the `gws` CLI for Google Sheets operations.
 *
 * Sheets API command paths:
 *   gws sheets spreadsheets get        --params '{"spreadsheetId":"..."}'
 *   gws sheets spreadsheets values get --params '{"spreadsheetId":"...","range":"Sheet1!A1:B2"}'
 */
import type { SheetRange, SheetsProvider, GwsDeps } from './types.js';
export declare class GwsSheetsProvider implements SheetsProvider {
    readonly name = "sheets";
    private deps?;
    constructor(deps?: GwsDeps);
    isAvailable(): Promise<boolean>;
    getSpreadsheet(spreadsheetId: string): Promise<{
        id: string;
        title: string;
        sheets: string[];
    }>;
    getRange(spreadsheetId: string, range: string): Promise<SheetRange>;
}
export declare function getGwsSheetsProvider(deps?: GwsDeps): GwsSheetsProvider;
//# sourceMappingURL=sheets.d.ts.map