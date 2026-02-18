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

function makeState(overrides: Partial<WidgetState> = {}): WidgetState {
	return {
		planModeEnabled: false,
		executionMode: false,
		planId: null,
		status: null,
		planSize: null,
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

	it("shows plan id when available", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "my-feature",
				status: "draft",
				planSize: "medium",
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("my-feature"));
		assert.ok(result.includes("draft"));
		assert.ok(result.includes("medium"));
	});

	it("shows pre-mortem checkmark when completed", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "feature",
				status: "draft",
				hasPreMortem: true,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("pre-mortem ✓"));
	});

	it("shows multiple artifacts", () => {
		const result = renderFooterStatus(
			makeState({
				planModeEnabled: true,
				planId: "feature",
				status: "draft",
				hasPreMortem: true,
				hasReview: true,
				hasPrd: true,
			}),
			mockTheme,
		);
		assert.ok(result);
		assert.ok(result.includes("pre-mortem ✓"));
		assert.ok(result.includes("review ✓"));
		assert.ok(result.includes("PRD ✓"));
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
