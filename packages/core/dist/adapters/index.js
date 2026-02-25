/**
 * IDE Adapter Factory and Registry
 */
import { CursorAdapter } from './cursor-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
export { CursorAdapter } from './cursor-adapter.js';
export { ClaudeAdapter } from './claude-adapter.js';
export function getAdapter(target) {
    if (target === 'cursor')
        return new CursorAdapter();
    if (target === 'claude')
        return new ClaudeAdapter();
    throw new Error(`Invalid IDE target: ${target}`);
}
export function detectAdapter(workspaceRoot) {
    const cursorAdapter = new CursorAdapter();
    if (cursorAdapter.detectInWorkspace(workspaceRoot))
        return cursorAdapter;
    const claudeAdapter = new ClaudeAdapter();
    if (claudeAdapter.detectInWorkspace(workspaceRoot))
        return claudeAdapter;
    return new CursorAdapter();
}
export function getAdapterFromConfig(config, workspaceRoot) {
    if (config.ide_target)
        return getAdapter(config.ide_target);
    return detectAdapter(workspaceRoot);
}
//# sourceMappingURL=index.js.map