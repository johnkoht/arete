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

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function cleanLine(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/^[-*#>\s]+/, '')
    .trim();
}

function tunedContent(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0)
    .filter((line) => !/^copyright\s+/i.test(line))
    .filter((line) => !/^all rights reserved\.?$/i.test(line));
  return lines.join('\n');
}

function extractFacts(content: string): string[] {
  const text = tunedContent(content);
  const candidates = text
    .split(/[\n.!?]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20)
    .filter((part) => /[a-zA-Z]/.test(part));
  return candidates.slice(0, 8);
}

function summarizeStrategy(facts: string[]): string {
  if (facts.length === 0) {
    return 'No high-confidence strategy signals detected. Gather more context for review.';
  }

  const top = facts.slice(0, 3).map((fact) => `- ${fact}`).join('\n');
  return `Likely strategic themes:\n${top}`;
}

function buildChecklist(hasWebsite: boolean, hasFolder: boolean, hasPaste: boolean): string {
  const checks = [
    `- [ ] Confirm problem statement from extracted facts`,
    `- [ ] Confirm user/persona assumptions`,
    `- [ ] Confirm no sensitive content was promoted`,
    `- [ ] Confirm evidence references are accurate`,
  ];

  if (!hasWebsite) checks.push('- [ ] Optional: add company website input for better domain signals');
  if (!hasFolder) checks.push('- [ ] Optional: add docs in inputs/onboarding-dump/ for richer evidence');
  if (!hasPaste) checks.push('- [ ] Optional: paste team notes for missing context');

  return checks.join('\n');
}

export function buildContextDumpArtifacts(inputs: ContextDumpInput[]): ContextDumpArtifact[] {
  const facts = inputs.flatMap((input) => extractFacts(input.content));
  const evidenceRefs = inputs.map((input) => `${input.type}:${input.source}`);

  const draftContext: ContextDumpArtifact = {
    title: '[DRAFT] Context Summary',
    body: facts.length > 0 ? facts.map((fact) => `- ${fact}`).join('\n') : '- No reliable facts extracted yet.',
    evidenceRefs,
  };

  const strategy: ContextDumpArtifact = {
    title: '[DRAFT] Strategy Summary',
    body: summarizeStrategy(facts),
    evidenceRefs,
  };

  const hasWebsite = inputs.some((input) => input.type === 'website');
  const hasFolder = inputs.some((input) => input.type === 'folder');
  const hasPaste = inputs.some((input) => input.type === 'paste');

  const checklist: ContextDumpArtifact = {
    title: '[DRAFT] Review Checklist',
    body: buildChecklist(hasWebsite, hasFolder, hasPaste),
    evidenceRefs,
  };

  return [draftContext, strategy, checklist];
}

export function buildContextDumpQualityReport(inputs: ContextDumpInput[]): ContextDumpQualityReport {
  const artifacts = buildContextDumpArtifacts(inputs);
  const extractedFacts = artifacts[0]?.body
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('No reliable facts')) ?? [];

  const completenessScore = clamp(extractedFacts.length / 6);

  const totalEvidenceRefs = artifacts.reduce((sum, artifact) => sum + artifact.evidenceRefs.length, 0);
  const evidenceCoverageScore = inputs.length > 0
    ? clamp(totalEvidenceRefs / (inputs.length * artifacts.length))
    : 0;

  const extractionQualityScore = clamp((completenessScore * 0.6) + (evidenceCoverageScore * 0.4));

  return {
    completenessScore,
    evidenceCoverageScore,
    extractionQualityScore,
    artifacts,
  };
}
