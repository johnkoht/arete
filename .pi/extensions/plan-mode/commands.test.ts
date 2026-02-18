import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	createDefaultState,
	getChangesSince,
	extractPrdFeatureSlug,
	hasUnsavedPlanChanges,
	getSuggestedNextActions,
} from "./commands.js";

describe("createDefaultState", () => {
	it("returns fresh default state", () => {
		const state = createDefaultState();
		assert.equal(state.planModeEnabled, false);
		assert.equal(state.executionMode, false);
		assert.equal(state.currentSlug, null);
		assert.equal(state.planSize, null);
		assert.equal(state.planText, "");
		assert.deepEqual(state.todoItems, []);
		assert.equal(state.preMortemRun, false);
		assert.equal(state.reviewRun, false);
		assert.equal(state.prdConverted, false);
	});
});

describe("getChangesSince", () => {
	it("returns empty array for invalid date", () => {
		const result = getChangesSince("invalid-date");
		assert.deepEqual(result.files, []);
		assert.equal(result.since, "invalid-date");
	});

	it("returns files array and since date", () => {
		// This will work in any git repo
		const result = getChangesSince("2020-01-01");
		assert.ok(Array.isArray(result.files));
		assert.equal(result.since, "2020-01-01");
	});
});

describe("extractPrdFeatureSlug", () => {
	it("extracts feature slug from PRD content", () => {
		const content = `# PRD
Feature: my-cool-feature
Some content here`;
		assert.equal(extractPrdFeatureSlug(content), "my-cool-feature");
	});

	it("returns null if no feature line", () => {
		const content = "# PRD\nSome content without feature line";
		assert.equal(extractPrdFeatureSlug(content), null);
	});

	it("handles feature line with extra whitespace", () => {
		const content = "Feature:   spaced-feature   \nMore content";
		assert.equal(extractPrdFeatureSlug(content), "spaced-feature");
	});
});

describe("hasUnsavedPlanChanges", () => {
	it("returns false for empty state", () => {
		const state = createDefaultState();
		assert.equal(hasUnsavedPlanChanges(state), false);
	});

	it("returns true when plan text exists and no saved slug", () => {
		const state = createDefaultState();
		state.planText = "Plan:\n1. Test";
		assert.equal(hasUnsavedPlanChanges(state), true);
	});

	it("returns true when slug exists but plan file is missing", () => {
		const state = createDefaultState();
		state.currentSlug = "missing-plan";
		state.planText = "Plan:\n1. Test";
		assert.equal(hasUnsavedPlanChanges(state), true);
	});
});

describe("getSuggestedNextActions", () => {
	it("suggests approve/build actions by status", () => {
		assert.deepEqual(
			getSuggestedNextActions("draft", "small", { hasPreMortem: false, hasReview: false, hasPrd: false }),
			["/approve"],
		);
		assert.deepEqual(
			getSuggestedNextActions("ready", "small", { hasPreMortem: false, hasReview: false, hasPrd: false }),
			["/build"],
		);
	});

	it("adds recommendation actions for medium and large plans", () => {
		const mediumActions = getSuggestedNextActions("draft", "medium", {
			hasPreMortem: false,
			hasReview: false,
			hasPrd: false,
		});
		assert.ok(mediumActions.includes("/pre-mortem"));
		assert.ok(mediumActions.includes("/prd"));
		assert.ok(!mediumActions.includes("/review"));

		const largeActions = getSuggestedNextActions("draft", "large", {
			hasPreMortem: false,
			hasReview: false,
			hasPrd: false,
		});
		assert.ok(largeActions.includes("/review"));
	});
});
