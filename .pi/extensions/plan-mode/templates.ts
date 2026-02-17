/**
 * Plan templates module.
 *
 * Built-in plan templates for common work types.
 * Each template produces plan content compatible with extractTodoItems().
 */

/** A plan template definition */
export interface PlanTemplate {
	name: string;
	slug: string;
	description: string;
	/** Pre-built plan content with Plan: header and numbered steps */
	content: string;
}

const TEMPLATES: PlanTemplate[] = [
	{
		name: "Discovery",
		slug: "discovery",
		description: "Research → interviews → synthesis → recommendations",
		content: `# Discovery Plan

## Context

[Describe the problem space or question to investigate]

Plan:
1. **Define research questions** — Identify the 3-5 key questions to answer. What do we need to learn? What assumptions need validation?
   - AC: Clear, specific questions documented
   - AC: Each question has a hypothesis to test

2. **Map the landscape** — Research existing solutions, competitors, and prior art. Read relevant docs, codebases, and resources.
   - AC: Summary of findings with links/references
   - AC: Gaps and opportunities identified

3. **Gather user/stakeholder input** — Interview or survey relevant people. Capture direct quotes and observations.
   - AC: At least 3 data points collected
   - AC: Raw notes saved to working directory

4. **Synthesize findings** — Identify themes, patterns, and contradictions across all research. Triangulate evidence.
   - AC: Themes documented with supporting evidence
   - AC: Contradictions and open questions flagged

5. **Formulate recommendations** — Based on evidence, propose concrete next steps. Distinguish between validated insights and remaining assumptions.
   - AC: Recommendations are specific and actionable
   - AC: Each recommendation traces to evidence
   - AC: Risk assessment for each recommendation

- **Size**: medium
- **Steps**: 5
- **Key risks**: Confirmation bias, insufficient data points
- **Dependencies**: Access to users/stakeholders for input`,
	},
	{
		name: "Refactor",
		slug: "refactor",
		description: "Audit → design → migrate → verify → cleanup",
		content: `# Refactor Plan

## Context

[Describe what's being refactored and why]

Plan:
1. **Audit current state** — Read all files in scope, map dependencies, identify pain points. Document the current architecture and its limitations.
   - AC: File list and dependency graph documented
   - AC: Pain points and tech debt catalogued
   - AC: Scope boundaries clear (what changes, what doesn't)

2. **Design target state** — Define the new structure, interfaces, and patterns. Ensure backward compatibility where needed.
   - AC: New module/file structure documented
   - AC: Interface changes specified
   - AC: Migration path clear (incremental, not big-bang)

3. **Implement core changes** — Build the new structure. Create new modules, move logic, update interfaces. Keep existing tests passing throughout.
   - AC: New modules created with correct interfaces
   - AC: Existing tests still pass after each change
   - AC: No functionality lost

4. **Update consumers** — Migrate all callers to the new interfaces. Update imports, adapt to new patterns.
   - AC: All imports updated
   - AC: No dead code or unused exports remaining
   - AC: Full test suite passes

5. **Verify and clean up** — Run full quality gates, remove old code, update documentation. Verify no regressions.
   - AC: npm run typecheck passes
   - AC: npm test passes (all tests)
   - AC: Documentation reflects new structure
   - AC: Old files removed, no orphaned code

- **Size**: medium
- **Steps**: 5
- **Key risks**: Breaking existing consumers, missing edge cases in migration
- **Dependencies**: Full test coverage of current behavior`,
	},
	{
		name: "Integration",
		slug: "integration",
		description: "Research API → design interface → implement → test → document",
		content: `# Integration Plan

## Context

[Describe the system/service being integrated and the value it provides]

Plan:
1. **Research the external API** — Read API docs, authentication requirements, rate limits, data models. Identify the specific endpoints/features needed.
   - AC: API capabilities documented
   - AC: Auth flow understood (API key, OAuth, etc.)
   - AC: Rate limits and constraints noted
   - AC: Required endpoints/features listed

2. **Design the integration interface** — Define the internal interface that wraps the external API. Follow existing provider/adapter patterns in the codebase.
   - AC: Interface defined with clear method signatures
   - AC: Error types and handling strategy documented
   - AC: Follows existing integration patterns (check src/integrations/)
   - AC: Configuration schema defined

3. **Implement the provider** — Build the integration module. Handle auth, requests, response parsing, error handling, and retries.
   - AC: Provider implements the designed interface
   - AC: Auth and configuration work correctly
   - AC: Errors are handled gracefully (network, auth, rate limit)
   - AC: Response data mapped to internal types

4. **Add tests** — Unit tests with mocked API responses. Test happy path, error cases, edge cases. Integration test with real API if feasible.
   - AC: Happy path tests pass
   - AC: Error handling tests (network failure, auth failure, rate limit)
   - AC: Edge cases covered (empty responses, pagination, malformed data)
   - AC: All tests pass with npm test

5. **Wire up and document** — Register the provider, add CLI commands if needed, update configuration docs, add to AGENTS.md if applicable.
   - AC: Provider registered and discoverable
   - AC: Configuration documented (env vars, settings)
   - AC: Usage examples in docs
   - AC: Quality gates pass

- **Size**: medium
- **Steps**: 5
- **Key risks**: API changes, auth complexity, rate limiting
- **Dependencies**: API access and credentials`,
	},
];

/**
 * Get all available plan templates.
 */
export function getTemplates(): PlanTemplate[] {
	return TEMPLATES;
}

/**
 * Get a template by slug. Returns null if not found.
 */
export function getTemplate(slug: string): PlanTemplate | null {
	return TEMPLATES.find((t) => t.slug === slug) ?? null;
}

/**
 * Get template names for display.
 */
export function getTemplateOptions(): string[] {
	return TEMPLATES.map((t) => `${t.name} — ${t.description}`);
}
