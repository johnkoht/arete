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
		has_review: false,
		has_pre_mortem: false,
		has_prd: false,
		executionMode: false,
		todosCompleted: 0,
		todosTotal: 0,
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

	it("shows pre-mortem checkmark when completed", () => {
		const result = renderFooterStatus(
			makeState({ planModeEnabled: true, planSize: "large", todosTotal: 6, has_pre_mortem: true }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("pre-mortem ✓"));
	});

	it("shows execution progress", () => {
		const result = renderFooterStatus(
			makeState({ executionMode: true, todosCompleted: 3, todosTotal: 5 }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("⚡ 3/5"));
		assert.ok(result.includes("accent"));
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
		const lines = renderLifecycleWidget(makeState({ planModeEnabled: true }), mockTheme);
		assert.equal(lines.length, 1);
		assert.ok(lines[0].includes("Plan"));
		assert.ok(lines[0].includes("→"));
		assert.ok(lines[0].includes("Done"));
	});

	it("highlights build stage during execution", () => {
		const lines = renderLifecycleWidget(makeState({ executionMode: true, status: "in-progress" }), mockTheme);
		assert.ok(lines[0].includes("[accent]⚡ Build[/accent]"));
	});

	it("shows completed stages with checkmark", () => {
		const lines = renderLifecycleWidget(
			makeState({
				planModeEnabled: true,
				planSize: "medium",
				status: "approved",
				has_review: true,
			}),
			mockTheme,
		);
		assert.ok(lines[0].includes("Plan ✓"));
		assert.ok(lines[0].includes("Review ✓"));
	});

	it("shows done stage for completed plans", () => {
		const lines = renderLifecycleWidget(makeState({ status: "completed" }), mockTheme);
		assert.ok(lines[0].includes("[accent]📊 Done[/accent]"));
	});
});
