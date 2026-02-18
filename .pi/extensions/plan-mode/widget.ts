/**
 * Lifecycle status widget module.
 *
 * Pure rendering functions for the plan lifecycle pipeline.
 * Receives state and theme, returns styled strings.
 */

import type { PlanSize, PlanStatus } from "./persistence.js";
import type { Phase } from "./utils.js";
import {
	formatCompactExecutionStatus,
	type ExecutionProgressSnapshot,
	type ExecutionRole,
} from "./execution-progress.js";

/** State for widget rendering */
export interface WidgetState {
	planModeEnabled: boolean;
	planSize: PlanSize | null;
	status: PlanStatus | null;
	currentPhase: Phase;
	has_review: boolean;
	has_pre_mortem: boolean;
	has_prd: boolean;
	executionMode: boolean;
	todosCompleted: number;
	todosTotal: number;
	activeRole: ExecutionRole;
	executionProgress: ExecutionProgressSnapshot | null;
	planId: string | null;
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
	key: "plan" | "prd" | "pre-mortem" | "review" | "build" | "done";
}

const PIPELINE_STAGES: PipelineStage[] = [
	{ emoji: "📋", label: "Plan", key: "plan" },
	{ emoji: "📄", label: "PRD", key: "prd" },
	{ emoji: "🛡", label: "Pre-mortem", key: "pre-mortem" },
	{ emoji: "🔍", label: "Review", key: "review" },
	{ emoji: "⚡", label: "Build", key: "build" },
	{ emoji: "📊", label: "Done", key: "done" },
];

/**
 * Determine the current pipeline stage from widget state.
 */
function getCurrentStage(state: WidgetState): PipelineStage["key"] {
	// Primary source of truth: currentPhase
	switch (state.currentPhase) {
		case "plan":
			return "plan";
		case "prd":
			return "prd";
		case "pre-mortem":
			return "pre-mortem";
		case "review":
			return "review";
		case "build":
			return "build";
		case "done":
			return "done";
		default:
			break;
	}

	// Legacy fallback for older persisted state
	if (!state.planModeEnabled && !state.executionMode && state.status === "completed") return "done";
	if (state.executionMode || state.status === "in-progress") return "build";
	if (state.has_review || state.status === "reviewed") return "review";
	if (state.has_pre_mortem) return "pre-mortem";
	if (state.has_prd || state.status === "approved") return "prd";
	if (state.planSize || state.status === "draft" || state.status === "planned") return "plan";
	return "plan";
}

/**
 * Determine which stages are completed.
 */
function getCompletedStages(state: WidgetState): Set<PipelineStage["key"]> {
	const completed = new Set<PipelineStage["key"]>();

	// Phase progression is primary source of completion
	const phaseOrder: Phase[] = ["plan", "prd", "pre-mortem", "review", "build", "done"];
	const stageByPhase: Record<Phase, PipelineStage["key"]> = {
		plan: "plan",
		prd: "prd",
		"pre-mortem": "pre-mortem",
		review: "review",
		build: "build",
		done: "done",
	};

	const currentIndex = phaseOrder.indexOf(state.currentPhase);
	if (currentIndex >= 0) {
		for (let i = 0; i < currentIndex; i++) {
			completed.add(stageByPhase[phaseOrder[i]]);
		}
		if (state.currentPhase === "done") {
			completed.add("done");
		}
	}

	// Completion flags can mark stages complete independent of phase
	if (state.has_prd) completed.add("prd");
	if (state.has_pre_mortem) completed.add("pre-mortem");
	if (state.has_review) completed.add("review");

	// Legacy fallback from status
	if (state.status === "completed") {
		completed.add("plan");
		completed.add("prd");
		completed.add("pre-mortem");
		completed.add("review");
		completed.add("build");
		completed.add("done");
	}

	return completed;
}

/**
 * Render footer status text for the current lifecycle phase.
 */
export function renderFooterStatus(state: WidgetState, theme: WidgetTheme): string | undefined {
	const planPrefix = state.planId ? `${state.planId} · ` : "";

	// Execution mode: show compact PRD status when PRD progress is available.
	if (state.executionMode && state.executionProgress && state.executionProgress.total > 0) {
		if (state.executionProgress.source === "prd") {
			return theme.fg(
				"accent",
				`⚡ ${planPrefix}${formatCompactExecutionStatus(state.activeRole, state.executionProgress, 42)}`,
			);
		}
		return theme.fg("accent", `⚡ ${planPrefix}${state.todosCompleted}/${state.todosTotal}`);
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
		const planLabel = state.planId ?? "plan";
		return theme.fg("warning", `📋 ${planLabel} (${sizeInfo}${extrasStr})`);
	}

	// Plan mode (no plan yet)
	if (state.planModeEnabled) {
		return theme.fg("warning", `⏸ ${state.planId ?? "plan"}`);
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

	const lines = [parts.join(" → ")];
	if (state.planId) {
		lines.push(theme.fg("muted", `Plan: ${state.planId}`));
	}
	return lines;
}
