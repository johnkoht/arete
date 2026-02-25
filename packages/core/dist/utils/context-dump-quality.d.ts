export type ContextDumpInputType = 'website' | 'folder' | 'paste';
export type ContextDumpInput = {
    type: ContextDumpInputType;
    source: string;
    content: string;
};
export type ContextDumpArtifact = {
    title: string;
    body: string;
    evidenceRefs: string[];
};
export type ContextDumpQualityReport = {
    completenessScore: number;
    evidenceCoverageScore: number;
    extractionQualityScore: number;
    artifacts: ContextDumpArtifact[];
};
export declare function buildContextDumpArtifacts(inputs: ContextDumpInput[]): ContextDumpArtifact[];
export declare function buildContextDumpQualityReport(inputs: ContextDumpInput[]): ContextDumpQualityReport;
//# sourceMappingURL=context-dump-quality.d.ts.map