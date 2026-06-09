/**
 * Chef-skip audit log writer (phase-10-followup-2 Step 3).
 *
 * Appends one JSON line per chef-skip event to
 * `dev/diary/chef-skip-log.md`. Format mirrors Phase 9's
 * `brief-invocations.log` (intelligence.ts:837-851):
 *
 *   ${ISO} chef-skip ${JSON.stringify(payload)}\n
 *
 * The middle token is the module name `chef-skip`, constant across all
 * events. The action discriminator (SKIP / PROPOSE / UNSKIP / CONFIRM /
 * ABSTAIN / APPLY-SKIP) lives inside the JSON payload under `action` —
 * documented divergence from Phase 9's per-invocation-mode token (M4
 * from pre-mortem; intentional, not a divergence to fix).
 *
 * Best-effort writer: failures (disk full, permission, etc.) do NOT
 * block winddown or apply. Caller never needs try/catch around this.
 *
 * Log file is gitignored alongside Phase 9's `brief-invocations.log`
 * pattern — see `.gitignore` `*.log` line. Note: `chef-skip-log.md`
 * uses `.md` not `.log` extension; the gitignore convention follows the
 * file is still treated as local-only audit (F4 mitigation from
 * pre-mortem v3). If a user wants to share findings, they `grep | jq`
 * a subset.
 */
/**
 * Action types written to the audit log. See plan §"Audit log" for the
 * semantic mapping.
 */
export type ChefSkipAction = 'SKIP' | 'PROPOSE' | 'UNSKIP' | 'CONFIRM' | 'ABSTAIN' | 'APPLY-SKIP';
/**
 * Payload for a chef-skip audit log entry. The `action` is required;
 * additional fields are caller-supplied (id, meeting, reason, evidence,
 * setBy, mtimeAgeSec, etc.) and serialized verbatim into the JSON line.
 */
export interface ChefSkipPayload {
    action: ChefSkipAction;
    /** Staged-item ID (e.g., 'ai_0042'). */
    id?: string;
    /** Meeting slug (e.g., 'john-jamie-2026-06-04'). */
    meeting?: string;
    /** For SKIP/PROPOSE: who wrote it. */
    setBy?: 'chef' | 'chef-proposed' | 'user' | 'user→chef';
    /** Human-readable reason. */
    reason?: string;
    /** Evidence reference. */
    evidence?: string;
    /** For ABSTAIN events when mtime-guard fired. */
    mtimeAgeSec?: number;
    /** Free-form additional context — preserved verbatim in the JSON. */
    [key: string]: unknown;
}
/**
 * Append one audit log line for a chef-skip event.
 *
 * Best-effort: errors during mkdir/appendFile are swallowed silently.
 *
 * @param workspaceRoot Absolute path to the workspace root
 * @param payload       The event payload — `action` is required; other
 *                      fields preserved verbatim in the JSON
 */
export declare function appendChefSkipLog(workspaceRoot: string, payload: ChefSkipPayload): Promise<void>;
//# sourceMappingURL=chef-skip-log.d.ts.map