/**
 * Resolve the Areté package/monorepo root.
 * Used for install and other commands that need to find runtime/, packages/, etc.
 */
/**
 * Get the Areté package root (monorepo root when in development).
 * Walks up from the current module location to find a directory containing
 * runtime/ (repo root) or packages/ (repo root).
 */
export declare function getPackageRoot(): string;
//# sourceMappingURL=package-root.d.ts.map