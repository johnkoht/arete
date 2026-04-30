/**
 * arete onboard — Quick identity setup for new workspaces
 *
 * Collects name, email, company to bootstrap context/profile.md
 * before full conversational onboarding. Optionally configures AI credentials
 * via OAuth login or API key.
 */
import type { Command } from 'commander';
/**
 * Default AI tier + task mapping written to a fresh workspace's `arete.yaml`
 * during onboarding (both OAuth and API-key flows). Exported for unit
 * verification — keeping the value testable prevents silent drift, since
 * the *runtime* default in `config.ts` and `services/ai.ts` is `'standard'`
 * for reconciliation but the workspace value wins when explicit.
 *
 * `reconciliation: 'standard'` is deliberate: Haiku is too non-deterministic
 * at the cross-meeting + LLM batch review pass (false-positive rate measurably
 * worse than Sonnet on real data — see `2026-04-30_self-match-reconciliation-fix.md`).
 */
export declare const ONBOARD_DEFAULT_AI_CONFIG: {
    readonly tiers: {
        readonly fast: "anthropic/claude-3-5-haiku-latest";
        readonly standard: "anthropic/claude-sonnet-4-latest";
        readonly frontier: "anthropic/claude-opus-4-latest";
    };
    readonly tasks: {
        readonly summary: "fast";
        readonly extraction: "fast";
        readonly decision_extraction: "standard";
        readonly learning_extraction: "standard";
        readonly significance_analysis: "frontier";
        readonly reconciliation: "standard";
    };
};
export declare function registerOnboardCommand(program: Command): void;
//# sourceMappingURL=onboard.d.ts.map