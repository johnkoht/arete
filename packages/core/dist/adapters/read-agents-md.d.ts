/**
 * Shared helper for reading the pre-built AGENTS.md from dist/
 */
/**
 * Read the pre-built AGENTS.md from dist/AGENTS.md.
 * Falls back to null if not found (caller should generate minimal version).
 */
export declare function readPrebuiltAgentsMd(): string | null;
/**
 * Generate a minimal AGENTS.md/CLAUDE.md fallback when dist/AGENTS.md is not available.
 */
export declare function generateMinimalAgentsMd(): string;
//# sourceMappingURL=read-agents-md.d.ts.map