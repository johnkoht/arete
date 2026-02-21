/**
 * Pure utility functions for plan mode (simplified).
 * Extracted for testability.
 */

import type { PlanSize } from "./persistence.js";

// Re-export PlanSize for convenience
export type { PlanSize };

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
