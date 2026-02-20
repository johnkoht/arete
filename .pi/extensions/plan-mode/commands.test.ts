import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
	createDefaultState,
	getChangesSince,
	extractPrdFeatureSlug,
	hasUnsavedPlanChanges,
	getSuggestedNextActions,
	handlePlan,
	handlePlanSave,
	handlePlanRename,
	type PlanModeState,
	type CommandContext,
	type CommandPi,
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
			getSuggestedNextActions("idea", "small", { hasPreMortem: false, hasReview: false, hasPrd: false }),
			["/approve"],
		);
		assert.deepEqual(
			getSuggestedNextActions("draft", "small", { hasPreMortem: false, hasReview: false, hasPrd: false }),
			["/approve"],
		);
		assert.deepEqual(
			getSuggestedNextActions("planned", "small", { hasPreMortem: false, hasReview: false, hasPrd: false }),
			["/build"],
		);
		assert.deepEqual(
			getSuggestedNextActions("abandoned", "small", { hasPreMortem: false, hasReview: false, hasPrd: false }),
			["/plan new"],
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

// Test helpers
const TEST_PLANS_DIR = "dev/plans-test";

function createTestContext(overrides: Partial<CommandContext["ui"]> = {}): CommandContext {
	return {
		hasUI: true,
		ui: {
			select: async () => undefined,
			confirm: async () => true,
			notify: () => {},
			editor: async () => undefined,
			...overrides,
		},
	};
}

function createTestPi(): CommandPi & { entries: unknown[] } {
	const entries: unknown[] = [];
	return {
		entries,
		sendUserMessage: () => {},
		sendMessage: () => {},
		appendEntry: (_type, data) => entries.push(data),
		setActiveTools: () => {},
		getActiveTools: () => [],
	};
}

function createTestState(overrides: Partial<PlanModeState> = {}): PlanModeState {
	return {
		...createDefaultState(),
		...overrides,
	};
}

function setupTestPlansDir(): void {
	if (existsSync(TEST_PLANS_DIR)) {
		rmSync(TEST_PLANS_DIR, { recursive: true, force: true });
	}
	mkdirSync(TEST_PLANS_DIR, { recursive: true });
}

function cleanupTestPlansDir(): void {
	if (existsSync(TEST_PLANS_DIR)) {
		rmSync(TEST_PLANS_DIR, { recursive: true, force: true });
	}
}

function createTestPlan(slug: string, content: string): void {
	const planDir = join(TEST_PLANS_DIR, slug);
	mkdirSync(planDir, { recursive: true });
	const frontmatter = `---
title: ${slug.replace(/-/g, " ")}
slug: ${slug}
status: draft
size: small
tags: []
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

`;
	writeFileSync(join(planDir, "plan.md"), frontmatter + content, "utf-8");
}

describe("handlePlanSave", () => {
	beforeEach(() => setupTestPlansDir());
	afterEach(() => cleanupTestPlansDir());

	it("prompts for name on first save when no slug exists", async () => {
		let editorCalled = false;
		const ctx = createTestContext({
			editor: async (title, prefill) => {
				editorCalled = true;
				assert.ok(title.includes("Name"));
				return "my-new-plan";
			},
		});
		const pi = createTestPi();
		const state = createTestState({ planText: "# Test Plan\nSome content" });

		// Note: This will try to save to real dev/plans/ since we can't easily inject basePath
		// For a full integration test, we'd need to refactor savePlan to accept basePath
		// For now, we verify the prompt behavior
		await handlePlanSave(undefined, ctx, pi, state);

		assert.equal(editorCalled, true, "Should prompt for plan name");
	});

	it("errors when trying to save with different name than current slug", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Test\nContent",
			currentSlug: "existing-plan",
		});

		await handlePlanSave("different-name", ctx, pi, state);

		assert.ok(notifyMessage.includes("already saved"), "Should warn about existing slug");
		assert.ok(notifyMessage.includes("/plan rename"), "Should suggest rename command");
	});

	it("allows save without prompt when slug already exists", async () => {
		let editorCalled = false;
		let notifyMessage = "";
		const ctx = createTestContext({
			editor: async () => {
				editorCalled = true;
				return "something";
			},
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Test\nContent",
			currentSlug: "existing-plan",
		});

		await handlePlanSave(undefined, ctx, pi, state);

		assert.equal(editorCalled, false, "Should not prompt when slug exists");
		assert.ok(notifyMessage.includes("Saved"), "Should confirm save");
	});

	it("cancels save when user dismisses name prompt", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			editor: async () => undefined, // User cancelled
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState({ planText: "# Test\nContent" });

		await handlePlanSave(undefined, ctx, pi, state);

		assert.ok(notifyMessage.includes("cancelled"), "Should indicate cancellation");
		assert.equal(state.currentSlug, null, "Should not set slug");
	});
});

describe("handlePlanRename", () => {
	it("errors when no active plan exists", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState();

		await handlePlanRename("new-name", ctx, pi, state);

		assert.ok(notifyMessage.includes("No active plan"), "Should error on no plan");
	});

	it("errors when new name equals current name", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Test\nContent",
			currentSlug: "my-plan",
		});

		await handlePlanRename("my-plan", ctx, pi, state);

		assert.ok(notifyMessage.includes("same as current"), "Should note same name");
	});

	it("prompts for name when not provided", async () => {
		let editorCalled = false;
		const ctx = createTestContext({
			editor: async (title, prefill) => {
				editorCalled = true;
				assert.equal(prefill, "old-plan");
				return undefined; // Cancel
			},
			notify: () => {},
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Test\nContent",
			currentSlug: "old-plan",
		});

		await handlePlanRename(undefined, ctx, pi, state);

		assert.equal(editorCalled, true, "Should prompt for new name");
	});
});

describe("handlePlan — /plan new", () => {
	it("pre-sets slug when name argument is provided", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState();
		let toggleCalled = false;
		const togglePlanMode = () => {
			toggleCalled = true;
			state.planModeEnabled = true;
		};

		await handlePlan("new my cool feature", ctx, pi, state, togglePlanMode);

		assert.equal(state.currentSlug, "my-cool-feature", "Should slugify and set currentSlug");
		assert.equal(toggleCalled, true, "Should enable plan mode");
		assert.ok(notifyMessage.includes("my-cool-feature"), "Should mention the slug in notification");
	});

	it("does not pre-set slug when no name argument is provided", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState();
		const togglePlanMode = () => {
			state.planModeEnabled = true;
		};

		await handlePlan("new", ctx, pi, state, togglePlanMode);

		assert.equal(state.currentSlug, null, "Should not set slug without name");
		assert.ok(notifyMessage.includes("Describe your idea"), "Should show generic prompt");
		assert.ok(!notifyMessage.includes("for '"), "Should not mention a slug");
	});

	it("resets state from previous plan before starting new one", async () => {
		const ctx = createTestContext({
			confirm: async () => false, // Don't save unsaved changes
			notify: () => {},
		});
		const pi = createTestPi();
		const state = createTestState({
			planModeEnabled: true,
			currentSlug: "old-plan",
			planText: "old content",
			planSize: "large",
			todoItems: [{ text: "step 1", completed: false }],
			preMortemRun: true,
			reviewRun: true,
			prdConverted: true,
		});
		const togglePlanMode = () => {};

		await handlePlan("new fresh-start", ctx, pi, state, togglePlanMode);

		assert.equal(state.currentSlug, "fresh-start", "Should set new slug");
		assert.equal(state.planText, "", "Should clear plan text");
		assert.equal(state.planSize, null, "Should clear plan size");
		assert.deepEqual(state.todoItems, [], "Should clear todo items");
		assert.equal(state.preMortemRun, false, "Should reset pre-mortem flag");
		assert.equal(state.reviewRun, false, "Should reset review flag");
		assert.equal(state.prdConverted, false, "Should reset PRD flag");
	});
});
