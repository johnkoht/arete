/**
 * Gmail provider — thin wrapper over the `gws` CLI for email operations.
 *
 * Gmail API command paths:
 *   gws gmail users messages list --params '{"userId":"me","q":"...","maxResults":N}'
 *   gws gmail users messages get  --params '{"userId":"me","id":"...","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
 *
 * Note: messages.list returns only {id, threadId}. Full metadata requires a
 * separate messages.get call per message (capped at 10 to limit API calls).
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