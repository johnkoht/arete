/**
 * Model router: suggest task complexity tier (fast / balanced / powerful).
 * Similar to Dex's model-router; Areté does not switch models programmatically.
 * Output is a suggestion for the user or for tooling that can set model.
 */
export type ModelTier = 'fast' | 'balanced' | 'powerful';
export type TaskClassification = {
    tier: ModelTier;
    reason: string;
};
/**
 * Classify a prompt into a suggested model tier.
 * Use for cost/quality tradeoff: fast for lookups, powerful for analysis and writing.
 */
export declare function classifyTask(prompt: string): TaskClassification;
//# sourceMappingURL=model-router.d.ts.map