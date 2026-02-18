/**
 * Lifecycle status widget module.
 *
 * Pure rendering functions for the plan lifecycle pipeline.
 * Receives state and theme, returns styled strings.
 */

import type { PlanSize, PlanStatus } from "./persistence.js";

/** State for widget rendering */
export interface WidgetState {
	planModeEnabled: boolean;
	planSize: PlanSize | null;
	status: PlanStatus | null;
	has_review: boolean;
	has_pre_mortem: boolean;
	has_prd: boolean;
	executionMode: boolean;
	todosCompleted: number;
	todosTotal: number;
}

/** Minimal theme interface for widget rendering (subset of Pi's Theme) */
export interface WidgetTheme {
	fg(color: string, text: string): string;
	strikethrough(text: string): string;
}

/** Pipeline stages for the lifecycle widget */
interface PipelineStage {
	emoji: string;
	label: string;
	key: "plan" | "review" | "pre-mortem" | "build" | "done";
}

const PIPELINE_STAGES: PipelineStage[] = [
	{ emoji: "📋", label: "Plan", key: "plan" },
	{ emoji: "🔍", label: "Review", key: "review" },
	{ emoji: "🛡", label: "Pre-mortem", key: "pre-mortem" },
	{ emoji: "⚡", label: "Build", key: "build" },
	{ emoji: "📊", label: "Done", key: "done" },
];

/**
 * Determine the current pipeline stage from widget state.
 */
function getCurrentStage(state: WidgetState): PipelineStage["key"] {
	if (!state.planModeEnabled && !state.executionMode && state.status === "completed") return "done";
	if (state.executionMode || state.status === "in-progress") return "build";
	if (state.has_pre_mortem || state.has_prd || state.status === "approved") return "build";
	if (state.has_review || state.status === "reviewed" || state.status === "planned") return "pre-mortem";
	if (state.planSize || state.status === "draft") return "review";
	return "plan";
}

/**
 * Determine which stages are completed.
 */
function getCompletedStages(state: WidgetState): Set<PipelineStage["key"]> {
	const completed = new Set<PipelineStage["key"]>();

	// Plan is completed once we have a plan (planSize is set or status beyond draft)
	if (state.planSize || (state.status && state.status !== "draft")) {
		completed.add("plan");
	}

	if (
		state.has_review ||
		state.status === "reviewed" ||
		state.status === "approved" ||
		state.status === "in-progress" ||
		state.status === "completed"
	) {
		completed.add("review");
	}

	if (
		state.has_pre_mortem ||
		state.has_prd ||
		state.status === "approved" ||
		state.status === "in-progress" ||
		state.status === "completed"
	) {
		completed.add("pre-mortem");
	}

	if (state.status === "completed") {
		completed.add("build");
		completed.add("done");
	}

	return completed;
}

/**
 * Render footer status text for the current lifecycle phase.
 */
export function renderFooterStatus(state: WidgetState, theme: WidgetTheme): string | undefined {
	// Execution mode: show progress
	if (state.executionMode && state.todosTotal > 0) {
		return theme.fg("accent", `⚡ ${state.todosCompleted}/${state.todosTotal}`);
	}

	// Completed
	if (state.status === "completed") {
		return theme.fg("success", "✅ complete");
	}

	// Plan mode with plan extracted
	if (state.planModeEnabled && state.planSize) {
		const extras: string[] = [];
		if (state.has_pre_mortem) extras.push("pre-mortem ✓");
		if (state.has_review) extras.push("review ✓");
		if (state.has_prd) extras.push("PRD ✓");

		const sizeInfo = `${state.todosTotal} steps, ${state.planSize}`;
		const extrasStr = extras.length > 0 ? `, ${extras.join(", ")}` : "";
		return theme.fg("warning", `📋 plan (${sizeInfo}${extrasStr})`);
	}

	// Plan mode (no plan yet)
	if (state.planModeEnabled) {
		return theme.fg("warning", "⏸ plan");
	}

	// Not in plan mode
	return undefined;
}

/**
 * Render the lifecycle pipeline widget.
 * Returns styled lines showing the pipeline progression.
 */
export function renderLifecycleWidget(state: WidgetState, theme: WidgetTheme): string[] {
	const currentStage = getCurrentStage(state);
	const completed = getCompletedStages(state);

	const parts: string[] = [];

	for (const stage of PIPELINE_STAGES) {
		let stageText: string;

		if (completed.has(stage.key) && stage.key !== currentStage) {
			// Completed stage: muted with checkmark
			stageText = theme.fg("muted", `${stage.emoji} ${stage.label} ✓`);
		} else if (stage.key === currentStage) {
			// Current stage: accent color
			stageText = theme.fg("accent", `${stage.emoji} ${stage.label}`);
		} else {
			// Future stage: dim
			stageText = theme.fg("muted", `${stage.emoji} ${stage.label}`);
		}

		parts.push(stageText);
	}

	return [parts.join(" → ")];
}
