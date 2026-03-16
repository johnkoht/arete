/**
 * arete momentum — commitment and relationship momentum
 *
 * Shows commitment momentum (hot/stale/critical) and
 * relationship momentum (active/cooling/stale).
 */
import type { Command } from 'commander';
import type { CommitmentMomentum, RelationshipMomentum, StorageAdapter, Commitment } from '@arete/core';
export type MomentumCommandDeps = {
    computeCommitmentMomentumFn?: (commitments: Commitment[]) => CommitmentMomentum;
    computeRelationshipMomentumFn?: (meetingsDir: string, peopleDir: string, storage: StorageAdapter, opts: {
        personSlug?: string;
    }) => Promise<RelationshipMomentum>;
};
export declare function runMomentum(opts: {
    json?: boolean;
    person?: string;
}, deps?: MomentumCommandDeps): Promise<void>;
export declare function registerMomentumCommand(program: Command, deps?: MomentumCommandDeps): void;
//# sourceMappingURL=momentum.d.ts.map