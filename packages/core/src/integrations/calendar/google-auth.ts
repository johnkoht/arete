/**
 * Google Calendar OAuth2 authentication and credential storage.
 *
 * Handles the full OAuth2 flow: browser-based consent, localhost callback,
 * token exchange, credential persistence, and token refresh.
 *
 * All credential writes are atomic merges — existing credentials (fathom, krisp, etc.)
 * are preserved via read-modify-write on `.credentials/credentials.yaml`.
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exec } from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../../storage/adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoogleCalendarCredentials = {
  access_token: string;
  refresh_token: string;
  /** Unix timestamp in seconds: Math.floor(Date.now() / 1000) + expires_in */
  expires_at: number;
};

// ---------------------------------------------------------------------------
// Constants — embedded client ID/secret (shipped with npm package)
// ---------------------------------------------------------------------------

export const GOOGLE_CLIENT_ID = 'PLACEHOLDER_CLIENT_ID';
export const GOOGLE_CLIENT_SECRET = 'PLACEHOLDER_CLIENT_SECRET';

const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const CREDENTIAL_KEY = 'google_calendar';
const CONFIGURE_COMMAND = 'arete integration configure google-calendar';

/** Internal token endpoint response shape. */
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

// ---------------------------------------------------------------------------
// Client credentials
// ---------------------------------------------------------------------------

/**
 * Get effective client ID/secret.
 * Environment variables override embedded constants.
 */
export function getClientCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET,
  };
}

// ---------------------------------------------------------------------------
// Token validity
// ---------------------------------------------------------------------------

/**
 * Check if stored token is valid (not expired, with 5-minute buffer).
 */
export function isTokenValid(credentials: GoogleCalendarCredentials): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return credentials.expires_at - nowSeconds >= 300;
}

// ---------------------------------------------------------------------------
// Credential persistence (read-modify-write, atomic merge)
// ---------------------------------------------------------------------------

/**
 * Load Google Calendar credentials from `.credentials/credentials.yaml`.
 * Returns credentials or null if the `google_calendar` section is missing/incomplete.
 */
export async function loadGoogleCredentials(
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<GoogleCalendarCredentials | null> {
  const { join } = await import('path');
  const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');

  const exists = await storage.exists(credPath);
  if (!exists) return null;

  const content = await storage.read(credPath);
  if (!content) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const section = parsed?.[CREDENTIAL_KEY];
  if (!section || typeof section !== 'object') return null;

  const s = section as Record<string, unknown>;
  const access_token = s.access_token;
  const refresh_token = s.refresh_token;
  const expires_at = s.expires_at;

  if (
    typeof access_token !== 'string' || !access_token.trim() ||
    typeof refresh_token !== 'string' || !refresh_token.trim() ||
    typeof expires_at !== 'number'
  ) {
    return null;
  }

  return { access_token, refresh_token, expires_at };
}

/**
 * Save Google Calendar credentials to `.credentials/credentials.yaml`.
 *
 * Reads the existing file first, merges the `google_calendar` section into
 * the full object, and writes the entire file in one operation. Existing
 * credentials (fathom, krisp, etc.) are preserved.
 */
export async function saveGoogleCredentials(
  storage: StorageAdapter,
  workspaceRoot: string,
  credentials: GoogleCalendarCredentials
): Promise<void> {
  const { join } = await import('path');
  const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');

  let existing: Record<string, unknown> = {};

  const exists = await storage.exists(credPath);
  if (exists) {
    const content = await storage.read(credPath);
    if (content) {
      try {
        const parsed = parseYaml(content);
        if (parsed && typeof parsed === 'object') {
          existing = parsed as Record<string, unknown>;
        }
      } catch {
        // If YAML is malformed, start fresh but keep what we can
      }
    }
  }

  const merged: Record<string, unknown> = {
    ...existing,
    [CREDENTIAL_KEY]: {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expires_at: credentials.expires_at,
    },
  };

  await storage.write(credPath, stringifyYaml(merged));
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function isOAuthError(
  value: unknown,
  expected: string
): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.error === expected;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Refresh access token using refresh_token.
 *
 * POSTs to the Google token endpoint with client credentials in the request body
 * (NOT Basic auth — Google uses POST body auth for token exchange).
 *
 * Returns updated credentials with new access_token and expires_at.
 * Preserves the existing refresh_token unless Google rotates it.
 */
export async function refreshToken(
  credentials: GoogleCalendarCredentials
): Promise<GoogleCalendarCredentials> {
  const { clientId, clientSecret } = getClientCredentials();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refresh_token,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new Error('Unable to contact Google Calendar. Check your network and try again.');
  }

  let errorBody: unknown = null;
  if (!res.ok) {
    try {
      errorBody = await res.json();
    } catch {
      errorBody = null;
    }

    if (isOAuthError(errorBody, 'invalid_grant')) {
      throw new Error(`Google Calendar authorization expired — run: ${CONFIGURE_COMMAND}`);
    }

    if (isOAuthError(errorBody, 'invalid_client')) {
      throw new Error(
        'Google Calendar client configuration is invalid. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or use the packaged defaults and try again.'
      );
    }

    if (res.status === 429) {
      throw new Error('Google Calendar is rate limiting requests. Wait a minute and retry.');
    }

    if (res.status >= 500) {
      throw new Error('Google Calendar is temporarily unavailable. Please try again shortly.');
    }

    throw new Error(
      `Google Calendar token refresh failed (HTTP ${res.status}) — run: ${CONFIGURE_COMMAND}`
    );
  }

  const tokens = (await res.json()) as Partial<TokenResponse>;
  if (typeof tokens.access_token !== 'string' || typeof tokens.expires_in !== 'number') {
    throw new Error('Google Calendar returned an invalid token response. Please retry setup.');
  }

  return {
    access_token: tokens.access_token,
    // Google may or may not return a new refresh_token; preserve existing if not
    refresh_token: tokens.refresh_token ?? credentials.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
  };
}

// ---------------------------------------------------------------------------
// Browser helper
// ---------------------------------------------------------------------------

/**
 * Open a URL in the default browser (platform-aware).
 */
function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let command: string;
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (err) => {
      if (err) reject(new Error('Unable to open your browser automatically.'));
      else resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Full OAuth flow
// ---------------------------------------------------------------------------

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
export async function authenticate(
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<GoogleCalendarCredentials> {
  const { clientId, clientSecret } = getClientCredentials();

  // Step 1: Bind callback server to OS-assigned port
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const addr = server.address() as AddressInfo | null;
  if (!addr) {
    server.close();
    throw new Error('Unable to start local callback server for Google Calendar setup. Please try again.');
  }
  const port = addr.port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  try {
    // Step 2: Build authorization URL
    const authUrl = new URL(AUTHORIZATION_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    // Step 3: Open browser
    try {
      await openBrowser(authUrl.toString());
    } catch {
      throw new Error(
        `Could not open your browser automatically. Open this URL manually to continue:\n${authUrl.toString()}`
      );
    }

    // Step 4: Wait for callback
    const authorizationCode = await new Promise<string>((resolve, reject) => {
      server.on('request', (req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
          if (url.pathname !== '/callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const error = url.searchParams.get('error');
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><p>Authorization failed. You may close this window.</p></body></html>');
            reject(
              new Error(
                `Google Calendar authorization was cancelled or denied (${error}) — run: ${CONFIGURE_COMMAND}`
              )
            );
            return;
          }

          const code = url.searchParams.get('code');
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><p>No authorization code received. You may close this window.</p></body></html>');
            reject(
              new Error(`No authorization code received from Google — run: ${CONFIGURE_COMMAND}`)
            );
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><p>✅ Google Calendar connected! You may close this window.</p></body></html>');
          resolve(code);
        } catch {
          reject(new Error('Failed to process Google Calendar callback response. Please retry setup.'));
        }
      });
    });

    // Step 5: Exchange code for tokens — client credentials in POST body (NOT Basic auth)
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
    } catch {
      throw new Error('Unable to contact Google during authorization. Check your network and retry.');
    }

    if (!tokenRes.ok) {
      let tokenErrorBody: unknown = null;
      try {
        tokenErrorBody = await tokenRes.json();
      } catch {
        tokenErrorBody = null;
      }

      if (isOAuthError(tokenErrorBody, 'invalid_grant')) {
        throw new Error(`Google rejected the authorization code — run: ${CONFIGURE_COMMAND}`);
      }

      if (isOAuthError(tokenErrorBody, 'invalid_client')) {
        throw new Error(
          'Google Calendar client configuration is invalid. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or use the packaged defaults and retry.'
        );
      }

      if (tokenRes.status >= 500) {
        throw new Error('Google authorization service is temporarily unavailable. Please try again shortly.');
      }

      throw new Error(`Google Calendar token exchange failed (HTTP ${tokenRes.status}) — run: ${CONFIGURE_COMMAND}`);
    }

    const tokens = (await tokenRes.json()) as Partial<TokenResponse>;
    if (
      typeof tokens.access_token !== 'string' ||
      typeof tokens.expires_in !== 'number' ||
      !tokens.refresh_token
    ) {
      throw new Error(
        'Google Calendar did not return complete OAuth tokens. Re-run setup and make sure you grant requested access.'
      );
    }

    const credentials: GoogleCalendarCredentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };

    // Step 6: Save credentials atomically
    await saveGoogleCredentials(storage, workspaceRoot, credentials);

    return credentials;
  } finally {
    server.close();
  }
}
