/**
 * Krisp MCP client.
 *
 * All OAuth logic lives here — nothing OAuth-related goes in integration.ts.
 * The CLI calls configure() and is responsible for persisting the returned tokens.
 *
 * Transport: plain JSON-RPC POST over fetch — no @modelcontextprotocol/client SDK.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import { type KrispCredentials } from './config.js';
import type { KrispMeeting, KrispDocument } from './types.js';
/**
 * Krisp MCP client.
 *
 * Encapsulates OAuth flow (configure), token refresh, and MCP tool calls.
 * Constructor takes storage + workspaceRoot to support credential loading and
 * atomic persistence inside callTool.
 */
export declare class KrispMcpClient {
    private storage;
    private workspaceRoot;
    constructor(storage: StorageAdapter, workspaceRoot: string);
    /**
     * Dynamically register this client with the Krisp OAuth server.
     *
     * Called once per configure() run (skipped if client_id already in credentials).
     * Returns client_id and client_secret.
     */
    register(port: number): Promise<{
        client_id: string;
        client_secret: string;
    }>;
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
    configure(storage: StorageAdapter, workspaceRoot: string): Promise<KrispCredentials>;
    /**
     * Exchange a refresh_token for a new access_token.
     *
     * Uses client_secret_basic authentication (Authorization: Basic header).
     * Returns new access_token + expires_at only — does NOT persist; caller persists.
     *
     * Throws "Both tokens expired" if the token endpoint returns 401.
     */
    refreshTokens(creds: KrispCredentials): Promise<{
        access_token: string;
        expires_at: number;
        refresh_token?: string;
    }>;
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
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    /**
     * List meetings within an optional date range.
     * Uses search_meetings with after/before params and requests all content fields.
     *
     * Krisp's structuredContent returns: { criteria, meetings: [...], count }
     * The text content returns a human-readable string with embedded JSON.
     */
    listMeetings(options?: {
        after?: string;
        before?: string;
        limit?: number;
        offset?: number;
    }): Promise<KrispMeeting[]>;
    /**
     * Fetch a document by its 32-character hex ID.
     */
    getDocument(documentId: string): Promise<KrispDocument>;
}
//# sourceMappingURL=client.d.ts.map