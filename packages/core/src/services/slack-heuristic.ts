/**
 * Slack-thread "substantial enough to summarize" heuristic.
 *
 * Phase 1 §a.3 / MC3: implements the logging-only heuristic that
 * gates whether a slack thread should produce a per-thread summary
 * file at `.arete/memory/summaries/slack/<thread-id>.md`.
 *
 * Pure decision logic; no I/O. The CLI logs each evaluation to
 * `memory/log.md` via MemoryLogService; the actual summary write
 * is gated by the `ARETE_SLACK_SUMMARIES` env flag (default OFF
 * during the 7-day shadow run).
 *
 * Default heuristic per Phase 1 plan:
 *
 *   substantial = messages ≥ 10
 *              OR decision detected
 *              OR participants ≥ 3
 *              OR user-flagged
 *
 * Each path is recorded as a `trigger` so the shadow-run log can
 * inform tuning. Triggers are reported in priority order (first
 * matching wins) for stable output, but the heuristic returns ALL
 * matched triggers so the log captures full reasoning.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackThreadEvalInput {
  /** Stable identifier for the thread (channel_id + thread_ts works). */
  threadId: string;
  /** Number of messages in the thread. */
  messages: number;
  /** Number of distinct participants in the thread. */
  participants: number;
  /**
   * Whether a decision/commitment was detected in the thread by the
   * upstream extractor. The slack-digest skill produces this signal
   * during its significance_analyst pass.
   */
  decisionDetected?: boolean;
  /**
   * User-flagged ("important — summarize this") via slack reaction
   * or skill arg. When set, summary is unconditional regardless of
   * other thresholds.
   */
  userFlagged?: boolean;
}

export type SlackHeuristicTrigger =
  | 'messages'
  | 'decision'
  | 'participants'
  | 'user_flag'
  | 'none';

export interface SlackHeuristicConfig {
  /** Default 10. Threshold met when `messages >= messageThreshold`. */
  messageThreshold?: number;
  /** Default 3. Threshold met when `participants >= participantThreshold`. */
  participantThreshold?: number;
}

export interface SlackHeuristicResult {
  threadId: string;
  wouldSummarize: boolean;
  /**
   * Primary trigger reason (priority order):
   *   user_flag > decision > messages > participants > none
   */
  trigger: SlackHeuristicTrigger;
  /** All matching triggers in evaluation order. */
  allTriggers: SlackHeuristicTrigger[];
  /** Echo of the input, for log lines. */
  messages: number;
  participants: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SLACK_MESSAGE_THRESHOLD = 10;
export const DEFAULT_SLACK_PARTICIPANT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

/**
 * Pure heuristic decision. No I/O.
 */
export function evaluateSlackThread(
  input: SlackThreadEvalInput,
  config: SlackHeuristicConfig = {},
): SlackHeuristicResult {
  const messageThreshold = config.messageThreshold ?? DEFAULT_SLACK_MESSAGE_THRESHOLD;
  const participantThreshold = config.participantThreshold ?? DEFAULT_SLACK_PARTICIPANT_THRESHOLD;

  const allTriggers: SlackHeuristicTrigger[] = [];
  if (input.userFlagged === true) allTriggers.push('user_flag');
  if (input.decisionDetected === true) allTriggers.push('decision');
  if (input.messages >= messageThreshold) allTriggers.push('messages');
  if (input.participants >= participantThreshold) allTriggers.push('participants');

  const wouldSummarize = allTriggers.length > 0;
  const trigger: SlackHeuristicTrigger = wouldSummarize ? allTriggers[0] : 'none';

  return {
    threadId: input.threadId,
    wouldSummarize,
    trigger,
    allTriggers: wouldSummarize ? allTriggers : ['none'],
    messages: input.messages,
    participants: input.participants,
  };
}

// ---------------------------------------------------------------------------
// Log line formatting
// ---------------------------------------------------------------------------

/**
 * Format a heuristic evaluation as a human-readable preview line.
 *
 * Note: the canonical log entry is written via `MemoryLogService.append`
 * which sorts field keys alphabetically per the Phase 0 grammar. This
 * formatter is a previews/debug-friendly shape — when in doubt, look at
 * `.arete/memory/log.md` for the actual event format.
 *
 * Event name uses kebab-case per memory-log.ts grammar:
 *
 *   ## [<ts>] slack-thread-eval | thread=<id> | would_summarize=<bool> | trigger=<…> | messages=<n> | participants=<n>
 *
 * Caller injects the timestamp so unit tests can be deterministic.
 */
export function formatSlackEvalLogLine(
  result: SlackHeuristicResult,
  timestamp: string,
): string {
  return [
    `## [${timestamp}] slack-thread-eval`,
    `thread=${result.threadId}`,
    `would_summarize=${result.wouldSummarize}`,
    `trigger=${result.trigger}`,
    `messages=${result.messages}`,
    `participants=${result.participants}`,
  ].join(' | ');
}

// ---------------------------------------------------------------------------
// Env flag gate
// ---------------------------------------------------------------------------

/**
 * Whether the slack-summary writer should actually run when the
 * heuristic says yes. During the 7-day shadow run (Phase 1 ship)
 * this stays false even when wouldSummarize is true.
 *
 * Tunable via ARETE_SLACK_SUMMARIES env var. "1", "true", "yes"
 * (case-insensitive) all enable; anything else disables.
 */
export function slackSummariesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ARETE_SLACK_SUMMARIES;
  if (v === undefined) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
