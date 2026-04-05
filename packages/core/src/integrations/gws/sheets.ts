/**
 * Sheets provider — thin wrapper over the `gws` CLI for Google Sheets operations.
 *
 * Implements `SheetsProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */

import { gwsExec } from './client.js';
import { detectGws } from './detection.js';
import type { SheetRange, SheetsProvider, GwsDeps } from './types.js';

// ---------------------------------------------------------------------------
// Response mapping helpers
// ---------------------------------------------------------------------------

type SheetMeta = {
  properties?: { title?: string };
};

type SpreadsheetRaw = {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: SheetMeta[];
};

type ValuesRaw = {
  range?: string;
  values?: string[][];
};

function mapSpreadsheet(raw: SpreadsheetRaw): { id: string; title: string; sheets: string[] } {
  const sheets: string[] = [];
  if (Array.isArray(raw.sheets)) {
    for (const s of raw.sheets) {
      const title = s.properties?.title;
      if (title) sheets.push(title);
    }
  }

  return {
    id: raw.spreadsheetId ?? '',
    title: raw.properties?.title ?? '',
    sheets,
  };
}

function mapRange(raw: ValuesRaw): SheetRange {
  return {
    range: raw.range ?? '',
    values: raw.values ?? [],
  };
}

// ---------------------------------------------------------------------------
// GwsSheetsProvider class
// ---------------------------------------------------------------------------

export class GwsSheetsProvider implements SheetsProvider {
  readonly name = 'sheets';
  private deps?: GwsDeps;

  constructor(deps?: GwsDeps) {
    this.deps = deps;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await detectGws(this.deps);
      return result.installed && result.authenticated !== false;
    } catch {
      return false;
    }
  }

  async getSpreadsheet(spreadsheetId: string): Promise<{ id: string; title: string; sheets: string[] }> {
    const raw = await gwsExec(
      'sheets',
      'get',
      { spreadsheetId },
      undefined,
      this.deps,
    );

    return mapSpreadsheet(raw as SpreadsheetRaw);
  }

  async getRange(spreadsheetId: string, range: string): Promise<SheetRange> {
    const raw = await gwsExec(
      'sheets',
      'values',
      { spreadsheetId, range },
      undefined,
      this.deps,
    );

    return mapRange(raw as ValuesRaw);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getGwsSheetsProvider(deps?: GwsDeps): GwsSheetsProvider {
  return new GwsSheetsProvider(deps);
}
