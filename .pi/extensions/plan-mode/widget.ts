/**
 * Widget module for plan mode (simplified).
 *
 * Pure rendering functions for plan status display.
 * Receives state and theme, returns styled strings.
 */

import type { PlanSize, PlanStatus } from "./persistence.js";

/** State for widget rendering */
export interface WidgetState {
	planModeEnabled: boolean;
	executionMode: boolean;
	planId: string | null;
	status: PlanStatus | null;
	planSize: PlanSize | null;
	todosCompleted: number;
	todosTotal: number;
	hasPreMortem: boolean;
	hasReview: boolean;
	hasPrd: boolean;
}

/** Minimal theme interface for widget rendering (subset of Pi's Theme) */
export interface WidgetTheme {
	fg(color: string, text: string): string;
	strikethrough(text: string): string;
}

/**
 * Render footer status text for plan mode.
 * Returns a single-line status string or undefined if not in plan/execution mode.
 *
 * Format: 📋 plan-name (status) — artifacts
 * Or during execution: ⚡ plan-name — 2/5 steps
 */
export function renderFooterStatus(state: WidgetState, theme: WidgetTheme): string | undefined {
	const { planModeEnabled, executionMode, planId, status, planSize, todosCompleted, todosTotal, hasPreMortem, hasReview, hasPrd } = state;

	// Execution mode: show progress
	if (executionMode && todosTotal > 0) {
		const label = planId ?? "build";
		return theme.fg("accent", `⚡ ${label} — ${todosCompleted}/${todosTotal} steps`);
	}

	// Completed
	if (status === "complete") {
		const label = planId ?? "plan";
		return theme.fg("success", `✅ ${label} complete`);
	}

	// Plan mode with plan loaded
	if (planModeEnabled && planId) {
		const artifacts: string[] = [];
		if (hasPreMortem) artifacts.push("pre-mortem ✓");
		if (hasReview) artifacts.push("review ✓");
		if (hasPrd) artifacts.push("PRD ✓");

		const statusLabel = status ?? "draft";
		const sizeLabel = planSize ? `, ${planSize}` : "";
		const artifactsStr = artifacts.length > 0 ? ` — ${artifacts.join(", ")}` : "";

		return theme.fg("warning", `📋 ${planId} (${statusLabel}${sizeLabel})${artifactsStr}`);
	}

	// Plan mode but no plan yet
	if (planModeEnabled) {
		return theme.fg("warning", "📋 plan mode");
	}

	// Not in plan mode
	return undefined;
}

/**
 * Render todo list widget for execution mode.
 * Returns array of styled lines, or undefined if no todos.
 */
export function renderTodoWidget(
	todoItems: Array<{ text: string; completed: boolean }>,
	theme: WidgetTheme,
): string[] | undefined {
	if (todoItems.length === 0) return undefined;

	return todoItems.map((item) => {
		if (item.completed) {
			return (
				theme.fg("success", "☑ ") +
				theme.fg("muted", theme.strikethrough(item.text))
			);
		}
		return `${theme.fg("muted", "☐ ")}${item.text}`;
	});
}
