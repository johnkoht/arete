/**
 * IDE Adapter Factory and Registry
 */
import type { IDEAdapter, IDETarget } from './ide-adapter.js';
import type { AreteConfig } from '../models/workspace.js';
export type { IDEAdapter, IDETarget, CanonicalRule } from './ide-adapter.js';
export { CursorAdapter } from './cursor-adapter.js';
export { ClaudeAdapter } from './claude-adapter.js';
export declare function getAdapter(target: IDETarget): IDEAdapter;
export declare function detectAdapter(workspaceRoot: string): IDEAdapter;
export declare function getAdapterFromConfig(config: AreteConfig, workspaceRoot: string): IDEAdapter;
//# sourceMappingURL=index.d.ts.map