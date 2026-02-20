import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderFooterStatus, renderTodoWidget, type WidgetState, type WidgetTheme } from "./widget.js";

// Mock theme that wraps text with markers for testing
const mockTheme: WidgetTheme = {
	fg(color: string, text: string): string {
		return `[${color}]${text}[/${color}]`;
	},
	strikethrough(text: string): string {
		return `~~${text}~~`;
	},
};

/** Extract text content from mock theme wrapper like [color]text[/color] */
function extractThemeContent(themed: string): string {
	return themed.replace(/\[[^\]]+\]/g, "");
}

function makeState(overrides: Partial<WidgetState> = {}): WidgetState {
	return {
		planModeEnabled: false,
		executionMode: false,
		planId: null,
		title: null,
		status: null,
		planSize: null,
		stepsCount: 0,
		todosCompleted: 0,
		todosTotal: 0,
		hasPreMortem: false,
		hasReview: false,
		hasPrd: false,
		...overrides,
	};
}

describe("renderFooterStatus", () => {
	it("returns undefined when not in plan or execution mode", () => {
		const result = renderFooterStatus(makeState(), mockTheme);
		assert.equal(result, undefined);
	});

	it("shows plan mode idle status", () => {
		const result = renderFooterStatus(makeState({ planModeEnabled: true }), mockTheme);
		assert.ok(result);
		assert.ok(result.includes("📋 plan mode"));
		assert.ok(result.includes("warning"));
	});

	it("shows plan with title, slug, status, size, steps, and gates (full format)", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "slack-integration",
				title: "Slack Integration",
				status: "draft",
				planSize: "medium",
				stepsCount: 5,
			}),
			mockTheme,
			120,
		);
		assert.ok(result);
		assert.ok(result.includes("Slack Integration"), "should include title");
		assert.ok(result.includes("(slack-integration)"), "should include slug in parens");
		assert.ok(result.includes("draft"), "should include status");
		assert.ok(result.includes("medium"), "should include size");
		assert.ok(result.includes("5 steps"), "should include step count");
		assert.ok(result.includes("☐pm"), "should include pm gate");
		assert.ok(result.includes("☐rv"), "should include rv gate");
		assert.ok(result.includes("☐prd"), "should include prd gate");
		assert.ok(result.includes("•"), "should use bullet separator");
	});

	it("shows all three gates completed", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "feature",
				title: "Feature",
				status: "planned",
				hasPreMortem: true,
				hasReview: true,
				hasPrd: true,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("☑pm"), "pre-mortem gate should be checked");
		assert.ok(result.includes("☑rv"), "review gate should be checked");
		assert.ok(result.includes("☑prd"), "PRD gate should be checked");
	});

	it("shows no gates completed (all ☐)", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "feature",
				title: "Feature",
				status: "draft",
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("☐pm"));
		assert.ok(result.includes("☐rv"));
		assert.ok(result.includes("☐prd"));
	});

	it("shows mixed gates (☑pm ☐rv ☑prd)", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "feature",
				title: "Feature",
				status: "draft",
				hasPreMortem: true,
				hasReview: false,
				hasPrd: true,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("☑pm"));
		assert.ok(result.includes("☐rv"));
		assert.ok(result.includes("☑prd"));
	});

	it("uses stepsCount in output", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "my-plan",
				title: "My Plan",
				status: "planned",
				planSize: "large",
				stepsCount: 8,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("8 steps"));
	});

	it("omits steps when stepsCount is 0", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "my-plan",
				title: "My Plan",
				status: "draft",
				planSize: "small",
				stepsCount: 0,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(!result.includes("steps"), "should not show steps when count is 0");
	});

	it("truncates title at width 60", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "slack-integration",
				title: "Slack Integration Feature",
				status: "draft",
				planSize: "medium",
				stepsCount: 5,
			}),
			mockTheme,
			60,
		);
		assert.ok(result);
		// Title should be truncated but slug, status, gates should be present
		assert.ok(result.includes("(slack-integration)"), "slug should be present");
		assert.ok(result.includes("draft"), "status should be present");
		assert.ok(result.includes("☐pm"), "gates should be present");
		// Full title should NOT be present (it's too long)
		// The result inside the theme wrapper should fit
		const inner = extractThemeContent(result);
		assert.ok(inner.includes("…"), "should have truncation ellipsis");
	});

	it("truncates aggressively at very small width (40)", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "my-plan",
				title: "A Very Long Plan Title That Should Be Cut",
				status: "draft",
				planSize: "medium",
				stepsCount: 5,
			}),
			mockTheme,
			40,
		);
		assert.ok(result);
		const inner = extractThemeContent(result);
		assert.ok(inner.includes("(my-plan)"), "slug should always be present");
		assert.ok(inner.includes("draft"), "status should always be present");
		assert.ok(inner.includes("☐pm"), "gates should always be present");
	});

	it("shows execution mode with progress", () => {
		const result = renderFooterStatus(
			makeState({
				executionMode: true,
				planId: "feature",
				todosCompleted: 2,
				todosTotal: 5,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("⚡"));
		assert.ok(result.includes("2/5 steps"));
		assert.ok(result.includes("accent"));
	});

	it("shows complete status", () => {
		const result = renderFooterStatus(
			makeState({ status: "complete", planId: "feature" }),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("✅"));
		assert.ok(result.includes("complete"));
		assert.ok(result.includes("success"));
	});
});

describe("renderTodoWidget", () => {
	it("returns undefined for empty todo list", () => {
		const result = renderTodoWidget([], mockTheme);
		assert.equal(result, undefined);
	});

	it("renders incomplete todos with checkbox", () => {
		const items = [
			{ text: "Step 1", completed: false },
			{ text: "Step 2", completed: false },
		];
		const result = renderTodoWidget(items, mockTheme);
		assert.ok(result);
		assert.equal(result.length, 2);
		assert.ok(result[0].includes("☐"));
		assert.ok(result[0].includes("Step 1"));
	});

	it("renders completed todos with strikethrough", () => {
		const items = [
			{ text: "Step 1", completed: true },
			{ text: "Step 2", completed: false },
		];
		const result = renderTodoWidget(items, mockTheme);
		assert.ok(result);
		assert.ok(result[0].includes("☑"));
		assert.ok(result[0].includes("~~Step 1~~"));
		assert.ok(result[0].includes("success"));
		assert.ok(result[1].includes("☐"));
	});
});
