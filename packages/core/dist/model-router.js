/**
 * Model router: suggest task complexity tier (fast / balanced / powerful).
 * Similar to Dex's model-router; Areté does not switch models programmatically.
 * Output is a suggestion for the user or for tooling that can set model.
 */
const FAST_PATTERNS = [
    /^(what|who|when|where|how many|list|show|get|find)\b/i,
    /^(search|look up|check|status)\b/i,
    /^(today|calendar|tasks)\b/i,
    /\b(quick|brief|short)\b/i,
];
const POWERFUL_PATTERNS = [
    /\b(analyze|assessment|evaluate|review|synthesize)\b/i,
    /\b(plan|strategy|prioritize|roadmap)\b/i,
    /\b(write|draft|compose|create.*document|prd)\b/i,
    /\b(explain|why|how does|reasoning)\b/i,
    /\b(complex|detailed|comprehensive)\b/i,
    /\b(compare|contrast|trade-?offs)\b/i,
    /\b(discovery|competitive|research)\b/i,
    /\b(finalize|archive|wrap up)\b/i,
];
/**
 * Classify a prompt into a suggested model tier.
 * Use for cost/quality tradeoff: fast for lookups, powerful for analysis and writing.
 */
export function classifyTask(prompt) {
    const p = prompt.trim();
    const len = p.length;
    if (len < 20) {
        for (const re of FAST_PATTERNS) {
            if (re.test(p)) {
                return { tier: 'fast', reason: 'Short, simple lookup' };
            }
        }
    }
    for (const re of POWERFUL_PATTERNS) {
        if (re.test(p)) {
            return { tier: 'powerful', reason: 'Analysis, planning, or writing' };
        }
    }
    if (len > 200) {
        return { tier: 'powerful', reason: 'Long, multi-part request' };
    }
    return { tier: 'balanced', reason: 'Standard request' };
}
//# sourceMappingURL=model-router.js.map