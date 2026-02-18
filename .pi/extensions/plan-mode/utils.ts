/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

// Destructive commands blocked in plan mode
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

// Safe read-only commands allowed in plan mode
const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*npm\s+run\s+typecheck\b/i,
	/^\s*npm\s+test\b/i,
	/^\s*npm\s+run\s+test:py\b/i,
	/^\s*npm\s+run\s+test:all\b/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*exa\b/,
];

export function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
	return !isDestructive && isSafe;
}

/**
 * During PRD conversion we permit minimal write-oriented bash needed for file scaffolding.
 * All other plan-mode turns remain read-only.
 */
export function isAllowedInPlanMode(command: string, activeCommand: string | null): boolean {
	if (activeCommand === "prd") {
		return isSafeCommand(command) || /^\s*mkdir\s+-p\b/.test(command);
	}
	return isSafeCommand(command);
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
		.replace(/`([^`]+)`/g, "$1") // Remove code
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: items.length + 1, text: cleaned, completed: false });
			}
		}
	}
	return items;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}

/**
 * Extract relevant content for a lifecycle phase from an agent response.
 * Falls back to full response if no expected headers are found.
 */
export function extractPhaseContent(response: string, phase: Phase): string {
	const text = response.trim();
	if (!text) return "";

	const startPatternsByPhase: Record<Phase, RegExp[]> = {
		plan: [/^\*{0,2}Plan:\*{0,2}\s*$/im, /^Plan:\s*$/im],
		prd: [/^#\s*PRD\b/im, /^##\s*PRD\b/im],
		"pre-mortem": [/^##\s*Pre-Mortem\b/im, /^###\s*Risk\b/im],
		review: [/^##\s*Review\b/im, /^#\s*Review\b/im],
		build: [],
		done: [],
	};

	const endMarkers = [/^##\s+/gm, /^#\s+/gm];
	const startPatterns = startPatternsByPhase[phase] ?? [];

	for (const pattern of startPatterns) {
		const match = pattern.exec(text);
		if (!match || match.index < 0) continue;

		const startIndex = match.index;
		const afterStart = text.slice(startIndex + match[0].length);
		const localEndCandidates = endMarkers
			.map((endPattern) => {
				const endMatch = endPattern.exec(afterStart);
				return endMatch ? endMatch.index : -1;
			})
			.filter((idx) => idx > 0);

		const endOffset = localEndCandidates.length > 0 ? Math.min(...localEndCandidates) : -1;
		const extracted = endOffset > 0
			? text.slice(startIndex, startIndex + match[0].length + endOffset)
			: text.slice(startIndex);
		const trimmed = extracted.trim();
		if (trimmed) return trimmed;
	}

	return text;
}

/**
 * Detect whether the assistant is asking for clarification and is likely
 * waiting for a user response before continuing the workflow.
 */
export function isAwaitingUserResponse(message: string): boolean {
	const text = message.trim();
	if (!text) return false;

	const questionMarks = (text.match(/\?/g) ?? []).length;
	if (questionMarks === 0) return false;

	const asksForInput = /\b(clarifying questions|to tailor|before i|please answer|can you share|let me know|which option|does this align|should i)\b/i.test(
		text,
	);

	const hasQuestionsSection = /\bquestions?:\s*$/im.test(text) || /^\s*[-*\d.)]+\s+.+\?/m.test(text);

	return asksForInput || hasQuestionsSection;
}

/**
 * Suggest a human-friendly plan name from plan text and extracted todo items.
 * Prefers a non-generic H1 title, otherwise falls back to first todo(s).
 */
export function suggestPlanName(planText: string, items: TodoItem[]): string {
	const headingMatch = planText.match(/^#\s+(.+)$/m);
	const heading = headingMatch ? headingMatch[1].trim() : "";

	if (heading && !isGenericPlanHeading(heading)) {
		return heading;
	}

	if (items.length > 0) {
		const first = cleanStepText(items[0].text);
		const second = items.length > 1 ? cleanStepText(items[1].text) : "";
		const combined = second ? `${first} + ${second}` : first;
		return combined.length > 60 ? `${combined.slice(0, 57)}...` : combined;
	}

	return "New Plan";
}

function isGenericPlanHeading(heading: string): boolean {
	const normalized = heading.toLowerCase().trim();
	const genericHeadings = new Set([
		"plan",
		"refactor",
		"todo",
		"to-do",
		"tasks",
		"work plan",
		"untitled",
		"untitled plan",
	]);
	return genericHeadings.has(normalized);
}

// ────────────────────────────────────────────────────────────
// Plan classification and smart menu utilities
// ────────────────────────────────────────────────────────────

/** Plan size classification */
export type PlanSize = "tiny" | "small" | "medium" | "large";

/** Pipeline phases for linear flow control (re-exported from commands.ts for convenience) */
export type Phase = "plan" | "prd" | "pre-mortem" | "review" | "build" | "done";

/** Keywords that indicate higher complexity */
export const COMPLEXITY_KEYWORDS = [
	"integration",
	"new system",
	"refactor",
	"multi-file",
	"migration",
	"provider",
	"architecture",
	"breaking change",
] as const;

/**
 * Classify plan size based on step count and complexity keywords.
 *
 * Rules:
 * - 0-2 steps, no keywords → tiny
 * - 2-3 steps, no keywords → small (but 2 steps + keyword → medium)
 * - 3-5 steps, or any with 1+ keyword → medium
 * - 6+ steps, or medium with 2+ keywords → large
 */
export function classifyPlanSize(items: TodoItem[], planText: string): PlanSize {
	const stepCount = items.length;
	const lowerText = planText.toLowerCase();
	const keywordCount = COMPLEXITY_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;

	// 6+ steps is always large
	if (stepCount >= 6) return "large";

	// 3-5 steps
	if (stepCount >= 3) {
		if (keywordCount >= 2) return "large";
		return "medium";
	}

	// 2 steps
	if (stepCount === 2) {
		if (keywordCount >= 1) return "medium";
		return "tiny";
	}

	// 0-1 steps
	if (keywordCount >= 1 && stepCount >= 1) return "medium";
	return "tiny";
}

/** State for building workflow menus */
export interface WorkflowMenuState {
	planSize: PlanSize;
	preMortemRun: boolean;
	reviewRun: boolean;
	prdConverted: boolean;
	postMortemRun: boolean;
}

/** Result from getPhaseMenu: exactly two options (refine current, continue to next) */
export interface PhaseMenuOptions {
	refine: string | null; // "Refine X" option, null if not applicable
	next: string | null; // "Continue to Y" option, null if at end
}

/** Completion flags that can affect next-step label for the current phase. */
export interface PhaseCompletion {
	prdConverted: boolean;
	preMortemRun: boolean;
	reviewRun: boolean;
}

/**
 * Get phase-based menu options for linear flow.
 * Returns exactly two options: refine current phase, continue to next phase.
 *
 * Supports flexible command invocation: if a gate was already run out-of-order,
 * "next" adapts to the next missing gate instead of repeating the same step.
 */
export function getPhaseMenu(
	phase: Phase,
	planSize: PlanSize,
	completion: PhaseCompletion = {
		prdConverted: false,
		preMortemRun: false,
		reviewRun: false,
	},
): PhaseMenuOptions {
	switch (phase) {
		case "plan": {
			const shouldGoThroughPrd = planSize === "medium" || planSize === "large";
			const next = shouldGoThroughPrd && !completion.prdConverted
				? "Continue to PRD"
				: !completion.preMortemRun
					? "Continue to pre-mortem"
					: !completion.reviewRun
						? "Continue to review"
						: "Continue to build";
			return { refine: "Refine plan", next };
		}

		case "prd": {
			const next = !completion.preMortemRun
				? "Continue to pre-mortem"
				: !completion.reviewRun
					? "Continue to review"
					: "Continue to build";
			return {
				refine: "Refine PRD",
				next,
			};
		}

		case "pre-mortem": {
			const next = planSize === "tiny" || planSize === "small"
				? completion.reviewRun ? "Continue to build" : "Skip review → build"
				: completion.reviewRun ? "Continue to build" : "Continue to review";
			return {
				refine: "Refine pre-mortem",
				next,
			};
		}

		case "review":
			return {
				refine: "Refine review",
				next: "Continue to build",
			};

		case "build":
		case "done":
			return { refine: null, next: null };

		default:
			return { refine: null, next: null };
	}
}

/**
 * Get contextual menu options based on plan size and completed gates.
 * @deprecated Use getPhaseMenu for linear flow. This function remains for backward compatibility.
 */
export function getMenuOptions(state: WorkflowMenuState): string[] {
	const { planSize, preMortemRun, reviewRun, prdConverted } = state;

	if (planSize === "tiny") {
		return [
			"Start build now (executes code changes)",
			"Save as draft",
			"Refine the plan",
		];
	}

	const executeLabel = preMortemRun
		? "Start build now (pre-mortem ✓, executes code changes)"
		: "Start build now (executes code changes)";

	if (planSize === "small") {
		const options: string[] = [];
		if (!preMortemRun) options.push("Run pre-mortem (no code changes)");
		options.push(executeLabel);
		if (!reviewRun) options.push("Review the plan");
		if (!prdConverted) options.push("Convert to PRD (no code changes)");
		options.push("Save as draft", "Refine the plan");
		return options;
	}

	// medium or large
	const options: string[] = [];
	if (!prdConverted) options.push("Convert to PRD (recommended, no code changes)");
	if (!preMortemRun) options.push("Run pre-mortem (no code changes)");
	if (!reviewRun) options.push("Review the plan");
	options.push(executeLabel);
	options.push("Save as draft", "Refine the plan");
	return options;
}

/**
 * Get post-execution menu options.
 */
export function getPostExecutionMenuOptions(postMortemRun: boolean): string[] {
	const options: string[] = [];
	if (!postMortemRun) options.push("Run post-mortem (extract learnings)");
	options.push("Capture learnings to memory", "Done");
	return options;
}
