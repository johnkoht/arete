/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Implements `EmailProvider` interface using `gwsExec()` for CLI calls
 * and `detectGws()` for availability checks.
 */
import type { EmailThread, EmailProvider, GwsDeps } from './types.js';
export declare class GmailProvider implements EmailProvider {
    readonly name = "gmail";
    private deps?;
    constructor(deps?: GwsDeps);
    isAvailable(): Promise<boolean>;
    searchThreads(query: string, options?: {
        maxResults?: number;
    }): Promise<EmailThread[]>;
    getThread(threadId: string): Promise<EmailThread>;
    getImportantUnread(options?: {
        maxResults?: number;
    }): Promise<EmailThread[]>;
}
export declare function getGmailProvider(deps?: GwsDeps): GmailProvider;
//# sourceMappingURL=gmail.d.ts.map