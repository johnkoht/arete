/**
 * Krisp MCP client.
 *
 * All OAuth logic lives here — nothing OAuth-related goes in integration.ts.
 * The CLI calls configure() and is responsible for persisting the returned tokens.
 *
 * Transport: plain JSON-RPC POST over fetch — no @modelcontextprotocol/client SDK.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import type { StorageAdapter } from '../../storage/adapter.js';
import {
  loadKrispCredentials,
  saveKrispCredentials,
  type KrispCredentials,
} from './config.js';
import type { KrispMeeting, KrispDocument } from './types.js';

const AUTH_BASE = 'https://api.krisp.ai/platform/v1/oauth2';
const REGISTRATION_URL = 'https://mcp.krisp.ai/.well-known/oauth-registration';
const MCP_URL = 'https://mcp.krisp.ai/mcp';

const SCOPES = [
  'user::me::read',
  'user::meetings::list',
  'user::meetings:metadata::read',
  'user::meetings:notes::read',
  'user::meetings:transcripts::read',
].join(' ');

/** Internal token response shape from the Krisp token endpoint. */
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

/** Internal JSON-RPC response wrapper. */
type JsonRpcResponse<T = unknown> = {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

/**
 * Generate a PKCE code_verifier (random 43-char base64url string).
 */
function generateCodeVerifier(): string {
  // 32 random bytes → 43-char base64url string (no padding)
  return randomBytes(32).toString('base64url');
}

/**
 * Derive PKCE code_challenge from a code_verifier using S256 method.
 *
 * Critical: use base64url (replace + → -, / → _, strip =) not plain base64.
 */
function deriveCodeChallenge(codeVerifier: string): string {
  const hash = createHash('sha256').update(codeVerifier).digest();
  return Buffer.from(hash)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Encode client_id:client_secret for HTTP Basic auth (client_secret_basic).
 */
function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

/**
 * Krisp MCP client.
 *
 * Encapsulates OAuth flow (configure), token refresh, and MCP tool calls.
 * Constructor takes storage + workspaceRoot to support credential loading and
 * atomic persistence inside callTool.
 */
export class KrispMcpClient {
  constructor(
    private storage: StorageAdapter,
    private workspaceRoot: string
  ) {}

  /**
   * Dynamically register this client with the Krisp OAuth server.
   *
   * Called once per configure() run (skipped if client_id already in credentials).
   * Returns client_id and client_secret.
   */
  async register(port: number): Promise<{ client_id: string; client_secret: string }> {
    const res = await fetch(REGISTRATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Arete CLI',
        redirect_uris: [`http://localhost:${port}/callback`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    });

    if (!res.ok) {
      throw new Error(`Krisp client registration failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const client_id = data.client_id;
    const client_secret = data.client_secret;

    if (typeof client_id !== 'string' || typeof client_secret !== 'string') {
      throw new Error('Krisp registration response missing client_id or client_secret');
    }

    return { client_id, client_secret };
  }

  /**
   * Run the full OAuth authorization code flow with PKCE + client_secret_basic.
   *
   * 1. Bind a localhost callback server on port 0 (OS-assigned)
   * 2. Register this client (skip if client_id already stored)
   * 3. Generate PKCE code_verifier + code_challenge (S256)
   * 4. Open the authorization URL in the default browser (macOS: `open`)
   * 5. Wait for the OAuth callback; extract the authorization code
   * 6. Exchange the code for tokens using client_secret_basic + code_verifier
   * 7. Return all 5 credential fields — does NOT persist; caller persists atomically
   */
  async configure(storage: StorageAdapter, workspaceRoot: string): Promise<KrispCredentials> {
    // Step 1: Bind callback server to OS-assigned port
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });

    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      server.close();
      throw new Error('Failed to bind callback server');
    }
    const port = addr.port;
    const redirectUri = `http://localhost:${port}/callback`;

    let authorizationCode: string;

    try {
      // Step 2: Register or reuse existing client credentials
      let existingCreds = await loadKrispCredentials(storage, workspaceRoot);
      let clientId: string;
      let clientSecret: string;

      if (existingCreds?.client_id && existingCreds?.client_secret) {
        clientId = existingCreds.client_id;
        clientSecret = existingCreds.client_secret;
      } else {
        const registered = await this.register(port);
        clientId = registered.client_id;
        clientSecret = registered.client_secret;
      }

      // Step 3: Generate PKCE
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier);
      const state = randomBytes(16).toString('hex');

      // Step 4: Build authorization URL
      const authUrl = new URL(`${AUTH_BASE}/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      // Step 5: Open browser
      await new Promise<void>((resolve, reject) => {
        exec(`open "${authUrl.toString()}"`, (err) => {
          if (err) reject(new Error(`Failed to open browser: ${err.message}`));
          else resolve();
        });
      });

      // Step 6: Wait for callback
      authorizationCode = await new Promise<string>((resolve, reject) => {
        server.on('request', (req, res) => {
          try {
            const url = new URL(req.url ?? '/', `http://localhost:${port}`);
            if (url.pathname !== '/callback') {
              res.writeHead(404);
              res.end('Not found');
              return;
            }

            const returnedState = url.searchParams.get('state');
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<html><body><p>Authorization failed. You may close this window.</p></body></html>');
              reject(new Error(`Browser closed before completing login — run \`arete integration configure krisp\` again`));
              return;
            }

            if (returnedState !== state) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<html><body><p>Invalid state. You may close this window.</p></body></html>');
              reject(new Error('OAuth state mismatch — possible CSRF; run `arete integration configure krisp` again'));
              return;
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<html><body><p>No authorization code received. You may close this window.</p></body></html>');
              reject(new Error(`Browser closed before completing login — run \`arete integration configure krisp\` again`));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><p>✅ Krisp connected! You may close this window.</p></body></html>');
            resolve(code);
          } catch (e) {
            reject(e);
          }
        });
      });

      // Step 7: Token exchange — confidential client: client_secret_basic + code_verifier
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      const tokenRes = await fetch(`${AUTH_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed — run \`arete integration configure krisp\` again`);
      }

      const tokens = (await tokenRes.json()) as TokenResponse;

      return {
        client_id: clientId,
        client_secret: clientSecret,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? '',
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      };
    } finally {
      // Step 8: Always close the server to prevent process hang
      server.close();
    }
  }

  /**
   * Exchange a refresh_token for a new access_token.
   *
   * Uses client_secret_basic authentication (Authorization: Basic header).
   * Returns new access_token + expires_at only — does NOT persist; caller persists.
   *
   * Throws "Both tokens expired" if the token endpoint returns 401.
   */
  async refreshTokens(
    creds: KrispCredentials
  ): Promise<{ access_token: string; expires_at: number }> {
    const tokenBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
    });

    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth(creds.client_id, creds.client_secret)}`,
      },
      body: tokenBody.toString(),
    });

    if (res.status === 401) {
      throw new Error(
        'Both tokens expired — run `arete integration configure krisp` to reconnect'
      );
    }

    if (!res.ok) {
      throw new Error(`Krisp token refresh failed: ${res.status} ${res.statusText}`);
    }

    const tokens = (await res.json()) as TokenResponse;
    return {
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };
  }

  /**
   * Call a Krisp MCP tool via JSON-RPC POST.
   *
   * Checks token expiry before each call. If expired, refreshes and persists
   * updated credentials via saveKrispCredentials before proceeding.
   *
   * Error mapping:
   * - 401 → session expired (re-run configure)
   * - 403 → Krisp Core plan required
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    let creds = await loadKrispCredentials(this.storage, this.workspaceRoot);
    if (!creds) {
      throw new Error(
        'Krisp credentials not found — run `arete integration configure krisp`'
      );
    }

    // Silent token refresh if expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (creds.expires_at < nowSeconds) {
      const refreshed = await this.refreshTokens(creds);
      const updatedCreds: KrispCredentials = {
        ...creds,
        access_token: refreshed.access_token,
        expires_at: refreshed.expires_at,
      };
      await saveKrispCredentials(this.storage, this.workspaceRoot, updatedCreds);
      creds = updatedCreds;
    }

    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name, arguments: args },
        id: 1,
      }),
    });

    if (res.status === 401) {
      throw new Error(
        'Krisp session expired — run `arete integration configure krisp`'
      );
    }

    if (res.status === 403) {
      throw new Error('Krisp Core plan required for meeting data access');
    }

    if (!res.ok) {
      throw new Error(`Krisp MCP error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as JsonRpcResponse;
    if (json.error) {
      throw new Error(`Krisp MCP tool error: ${json.error.message}`);
    }

    return json.result;
  }

  /**
   * List meetings within an optional date range.
   * Uses search_meetings with after/before params and requests all content fields.
   */
  async listMeetings(options: { after?: string; before?: string; limit?: number; offset?: number } = {}): Promise<KrispMeeting[]> {
    const result = await this.callTool('search_meetings', {
      ...options,
      fields: ['name', 'date', 'url', 'attendees', 'speakers', 'transcript',
               'meeting_notes', 'detailed_summary', 'key_points', 'action_items'],
    });
    // search_meetings may return array directly or wrapped in a results field
    if (Array.isArray(result)) return result as KrispMeeting[];
    const wrapped = result as { results?: KrispMeeting[] };
    return wrapped.results ?? [];
  }

  /**
   * Fetch a document by its 32-character hex ID.
   */
  async getDocument(documentId: string): Promise<KrispDocument> {
    const result = await this.callTool('get_document', { documentId });
    return result as KrispDocument;
  }
}
