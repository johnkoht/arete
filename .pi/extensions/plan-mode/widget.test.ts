import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderFooterStatus, renderLifecycleWidget, type WidgetState, type WidgetTheme } from "./widget.js";

// Mock theme that wraps text with markers for testing
const mockTheme: WidgetTheme = {
	fg(color: string, text: string): string {
		return `[${color}]${text}[/${color}]`;
	},
	strikethrough(text: string): string {
		return `~~${text}~~`;
	},
};

function makeState(overrides: Partial<WidgetState> = {}): WidgetState {
	return {
		planModeEnabled: false,
		planSize: null,
		status: null,
		currentPhase: "plan",
		has_review: false,
		has_pre_mortem: false,
		has_prd: false,
		executionMode: false,
		todosCompleted: 0,
		todosTotal: 0,
		activeRole: "PM",
		executionProgress: null,
		planId: null,
		...overrides,
	};
}

describe("renderFooterStatus", () => {
	it("returns undefined when not in plan mode", () => {
		const result = renderFooterStatus(makeState(), mockTheme);
		assert.equal(result, undefined);
	});

	it("shows plan mode idle status", () => {
		const result = renderFooterStatus(makeState({ planModeEnabled: true }), mockTheme);
		assert.ok(result);
		assert.ok(result.includes("⏸ plan"));
		assert.ok(result.includes("warning"));
	});

	it("shows plan with size and step count", () => {
		const result = renderFooterStatus(
			makeState({ planModeEnabled: true, planSize: "medium", todosTotal: 4 }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("4 steps, medium"));
	});

	it("shows plan id when available", () => {
		const result = renderFooterStatus(
			makeState({ planModeEnabled: true, planSize: "medium", todosTotal: 4, planId: "planning-system-refinement" }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("planning-system-refinement"));
	});

	it("shows pre-mortem checkmark when completed", () => {
		const result = renderFooterStatus(
			makeState({ planModeEnabled: true, planSize: "large", todosTotal: 6, has_pre_mortem: true }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("pre-mortem ✓"));
	});

	it("shows pre-mortem and review completion markers", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planSize: "large",
				todosTotal: 6,
				has_pre_mortem: true,
				has_review: true,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("pre-mortem ✓"));
		assert.ok(result.includes("review ✓"));
	});

	it("shows PRD checkmark when converted", () => {
		const result = renderFooterStatus(
			makeState({ planModeEnabled: true, planSize: "large", todosTotal: 6, has_prd: true }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("PRD ✓"));
	});

	it("shows compact PRD execution progress with role", () => {
		const result = renderFooterStatus(
			makeState({
				executionMode: true,
				activeRole: "EM",
				executionProgress: {
					source: "prd",
					total: 5,
					completed: 3,
					currentTask: { id: "4", title: "Current task", status: "in_progress", index: 4 },
					tasks: [],
				},
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("Role: EM"));
		assert.ok(result.includes("PRD: 3/5 complete"));
		assert.ok(result.includes("Status: in_progress"));
		assert.ok(result.includes("accent"));
	});

	it("falls back to legacy todo counter in non-PRD execution", () => {
		const result = renderFooterStatus(
			makeState({
				executionMode: true,
				todosCompleted: 2,
				todosTotal: 4,
				executionProgress: {
					source: "todo",
					total: 4,
					completed: 2,
					currentTask: { id: "3", title: "Task 3", status: "pending", index: 3 },
					tasks: [],
				},
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("⚡ 2/4"));
	});

	it("shows complete status", () => {
		const result = renderFooterStatus(makeState({ status: "completed" }), mockTheme);
		assert.ok(result);
		assert.ok(result.includes("✅ complete"));
		assert.ok(result.includes("success"));
	});
});

describe("renderLifecycleWidget", () => {
	it("renders pipeline with plan as current stage", () => {
		const lines = renderLifecycleWidget(makeState({ planModeEnabled: true, currentPhase: "plan" }), mockTheme);
		assert.ok(lines.length >= 1);
		assert.ok(lines[0].includes("Plan"));
		assert.ok(lines[0].includes("PRD"));
		assert.ok(lines[0].includes("Done"));
		assert.ok(lines[0].includes("→"));
	});

	it("adds plan id line when available", () => {
		const lines = renderLifecycleWidget(
			makeState({ planModeEnabled: true, currentPhase: "plan", planId: "planning-system-refinement" }),
			mockTheme,
		);
		assert.equal(lines.length, 2);
		assert.ok(lines[1].includes("Plan: planning-system-refinement"));
	});

	it("highlights PRD stage when currentPhase=prd", () => {
		const lines = renderLifecycleWidget(makeState({ planModeEnabled: true, currentPhase: "prd" }), mockTheme);
		assert.ok(lines[0].includes("[accent]📄 PRD[/accent]"));
		assert.ok(lines[0].includes("Plan ✓"));
	});

	it("highlights pre-mortem stage when currentPhase=pre-mortem", () => {
		const lines = renderLifecycleWidget(
			makeState({
				planModeEnabled: true,
				currentPhase: "pre-mortem",
			}),
			mockTheme,
		);
		assert.ok(lines[0].includes("[accent]🛡 Pre-mortem[/accent]"));
		assert.ok(lines[0].includes("PRD ✓"));
	});

	it("highlights review stage when currentPhase=review", () => {
		const lines = renderLifecycleWidget(makeState({ planModeEnabled: true, currentPhase: "review" }), mockTheme);
		assert.ok(lines[0].includes("[accent]🔍 Review[/accent]"));
		assert.ok(lines[0].includes("Pre-mortem ✓"));
	});

	it("highlights build stage when currentPhase=build", () => {
		const lines = renderLifecycleWidget(makeState({ currentPhase: "build", executionMode: true }), mockTheme);
		assert.ok(lines[0].includes("[accent]⚡ Build[/accent]"));
		assert.ok(lines[0].includes("Review ✓"));
	});

	it("shows done stage for completed plans", () => {
		const lines = renderLifecycleWidget(makeState({ currentPhase: "done", status: "completed" }), mockTheme);
		assert.ok(lines[0].includes("[accent]📊 Done[/accent]"));
	});
});
