/**
 * Krisp credential helpers.
 *
 * Reads and writes the `krisp:` section of `.credentials/credentials.yaml`.
 * All writes are atomic merges — existing credentials (fathom, slack, etc.) are preserved.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
export type KrispCredentials = {
    client_id: string;
    client_secret: string;
    access_token: string;
    refresh_token: string;
    /** Unix timestamp in seconds: Math.floor(Date.now() / 1000) + expires_in */
    expires_at: number;
};
/**
 * Load Krisp credentials from `.credentials/credentials.yaml`.
 * Returns all 5 fields or null if the `krisp:` section is missing or incomplete.
 */
export declare function loadKrispCredentials(storage: StorageAdapter, workspaceRoot: string): Promise<KrispCredentials | null>;
/**
 * Save Krisp credentials to `.credentials/credentials.yaml`.
 *
 * Reads the existing file first, merges the `krisp:` section into the full
 * object, and writes the entire file in one operation. Existing credentials
 * (fathom, slack, calendar, etc.) are preserved.
 */
export declare function saveKrispCredentials(storage: StorageAdapter, workspaceRoot: string, creds: KrispCredentials): Promise<void>;
//# sourceMappingURL=config.d.ts.map