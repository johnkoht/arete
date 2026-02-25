/**
 * Google Calendar OAuth2 authentication and credential storage.
 *
 * Handles the full OAuth2 flow: browser-based consent, localhost callback,
 * token exchange, credential persistence, and token refresh.
 *
 * All credential writes are atomic merges — existing credentials (fathom, krisp, etc.)
 * are preserved via read-modify-write on `.credentials/credentials.yaml`.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
export type GoogleCalendarCredentials = {
    access_token: string;
    refresh_token: string;
    /** Unix timestamp in seconds: Math.floor(Date.now() / 1000) + expires_in */
    expires_at: number;
};
export declare const GOOGLE_CLIENT_ID = "PLACEHOLDER_CLIENT_ID";
export declare const GOOGLE_CLIENT_SECRET = "PLACEHOLDER_CLIENT_SECRET";
/**
 * Get effective client ID/secret.
 * Environment variables override embedded constants.
 */
export declare function getClientCredentials(): {
    clientId: string;
    clientSecret: string;
};
/**
 * Check if stored token is valid (not expired, with 5-minute buffer).
 */
export declare function isTokenValid(credentials: GoogleCalendarCredentials): boolean;
/**
 * Load Google Calendar credentials from `.credentials/credentials.yaml`.
 * Returns credentials or null if the `google_calendar` section is missing/incomplete.
 */
export declare function loadGoogleCredentials(storage: StorageAdapter, workspaceRoot: string): Promise<GoogleCalendarCredentials | null>;
/**
 * Save Google Calendar credentials to `.credentials/credentials.yaml`.
 *
 * Reads the existing file first, merges the `google_calendar` section into
 * the full object, and writes the entire file in one operation. Existing
 * credentials (fathom, krisp, etc.) are preserved.
 */
export declare function saveGoogleCredentials(storage: StorageAdapter, workspaceRoot: string, credentials: GoogleCalendarCredentials): Promise<void>;
/**
 * Refresh access token using refresh_token.
 *
 * POSTs to the Google token endpoint with client credentials in the request body
 * (NOT Basic auth — Google uses POST body auth for token exchange).
 *
 * Returns updated credentials with new access_token and expires_at.
 * Preserves the existing refresh_token unless Google rotates it.
 */
export declare function refreshToken(credentials: GoogleCalendarCredentials): Promise<GoogleCalendarCredentials>;
/**
 * Run the full Google Calendar OAuth2 authorization code flow.
 *
 * 1. Bind a localhost callback server on port 0 (OS-assigned)
 * 2. Build authorization URL with offline access + consent prompt
 * 3. Open browser for user consent
 * 4. Wait for the OAuth callback with authorization code
 * 5. Exchange code for tokens (client credentials in POST body)
 * 6. Save credentials atomically and return them
 */
export declare function authenticate(storage: StorageAdapter, workspaceRoot: string): Promise<GoogleCalendarCredentials>;
//# sourceMappingURL=google-auth.d.ts.map