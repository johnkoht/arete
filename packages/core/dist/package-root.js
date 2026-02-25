/**
 * Resolve the Areté package/monorepo root.
 * Used for install and other commands that need to find runtime/, packages/, etc.
 */
import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
/**
 * Get the Areté package root (monorepo root when in development).
 * Walks up from the current module location to find a directory containing
 * runtime/ (repo root) or packages/ (repo root).
 */
export function getPackageRoot() {
    const __filename = fileURLToPath(import.meta.url);
    let current = resolve(dirname(__filename));
    // From packages/core/dist/package-root.js -> packages/core
    if (current.endsWith('dist') || current.endsWith('src')) {
        current = resolve(current, '..');
    }
    while (current !== dirname(current)) {
        const hasPackageJson = existsSync(join(current, 'package.json'));
        // Monorepo/package root markers
        if (existsSync(join(current, 'packages', 'runtime')) && hasPackageJson) {
            return current;
        }
        // Legacy/single-package layout marker
        if (existsSync(join(current, 'runtime')) && hasPackageJson) {
            return current;
        }
        // Fallback for package roots that expose a packages/ dir
        if (existsSync(join(current, 'packages')) && hasPackageJson) {
            return current;
        }
        current = dirname(current);
    }
    return process.cwd();
}
//# sourceMappingURL=package-root.js.map