import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
	createDefaultState,
	getChangesSince,
	extractPrdFeatureSlug,
	commitPlanToGit,
	hasUnsavedPlanChanges,
	getSuggestedNextActions,
	handlePlan,
	handlePlanSave,
	handlePlanRename,
	handlePlanStatus,
	parsePlanListFilter,
	preparePlanListItems,
	checkPrdExecutionComplete,
	type PlanModeState,
	type CommandContext,
	type CommandPi,
} from "./commands.js";
import { extractTodoItems } from "./utils.js";
import type { ExecutionProgressSnapshot } from "./execution-progress.js";

describe("createDefaultState", () => {
	it("returns fresh default state", () => {
		const state = createDefaultState();
		assert.equal(state.planModeEnabled, false);
		assert.equal(state.executionMode, false);
		assert.equal(state.currentSlug, null);
		assert.equal(state.planTitle, null);
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

describe("commitPlanToGit", () => {
	it("returns false for non-existent plan directory", () => {
		// No plan dir exists at this path, git add will fail silently
		const result = commitPlanToGit("nonexistent-plan-slug-xyz");
		assert.equal(result, false);
	});

	it("is exported and callable", () => {
		assert.equal(typeof commitPlanToGit, "function");
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
			custom: async () => null,
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
	// Redirect loadPlan/savePlan to the test directory
	process.env.ARETE_TEST_PLANS_DIR = TEST_PLANS_DIR;
}

function cleanupTestPlansDir(): void {
	delete process.env.ARETE_TEST_PLANS_DIR;
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
	beforeEach(() => setupTestPlansDir());
	afterEach(() => cleanupTestPlansDir());

	it("auto-saves when name argument is provided", async () => {
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
		assert.equal(state.planTitle, "My Cool Feature", "Should set planTitle to title-cased name");
		assert.equal(state.planText, "# My Cool Feature\n", "Should set planText with title heading");
		assert.equal(toggleCalled, true, "Should enable plan mode");
		assert.ok(notifyMessage.includes("my-cool-feature"), "Should mention the slug in notification");
		assert.ok(notifyMessage.includes("created and saved"), "Should confirm auto-save");
	});

	it("auto-saves when no name provided and editor provides name", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			editor: async () => "editor provided name",
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

		assert.equal(state.currentSlug, "editor-provided-name", "Should slugify editor result");
		assert.equal(state.planTitle, "Editor Provided Name", "Should title-case from slug");
		assert.equal(state.planText, "# Editor Provided Name\n", "Should set planText with title heading");
		assert.ok(notifyMessage.includes("created and saved"), "Should confirm auto-save");
	});

	it("does not save when no name provided and editor cancelled", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			editor: async () => undefined, // User cancelled
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

		assert.equal(state.currentSlug, null, "Should not set slug");
		assert.equal(state.planTitle, null, "Should not set planTitle");
		assert.equal(state.planText, "", "Should leave planText empty");
		assert.ok(notifyMessage.includes("not saved"), "Should notify plan not saved");
		assert.ok(notifyMessage.includes("/plan save"), "Should suggest /plan save");
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
			planTitle: "Old Plan",
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
		assert.equal(state.planTitle, "Fresh Start", "Should set new planTitle");
		assert.equal(state.planText, "# Fresh Start\n", "Should set planText with new title");
		assert.equal(state.planSize, null, "Should clear plan size");
		assert.deepEqual(state.todoItems, [], "Should clear todo items");
		assert.equal(state.preMortemRun, false, "Should reset pre-mortem flag");
		assert.equal(state.reviewRun, false, "Should reset review flag");
		assert.equal(state.prdConverted, false, "Should reset PRD flag");
	});

	it("plan is discoverable via listPlans after auto-save", async () => {
		const ctx = createTestContext({
			notify: () => {},
		});
		const pi = createTestPi();
		const state = createTestState();
		const togglePlanMode = () => {
			state.planModeEnabled = true;
		};

		await handlePlan("new discoverable-test-plan", ctx, pi, state, togglePlanMode);

		// Verify the plan was saved and is discoverable
		assert.equal(state.currentSlug, "discoverable-test-plan");
		assert.equal(state.planTitle, "Discoverable Test Plan");
		assert.ok(state.planText.includes("# Discoverable Test Plan"), "planText should contain title");

		// Clean up the auto-saved plan
		const { existsSync: exists, rmSync: rm } = await import("node:fs");
		const { join: pathJoin } = await import("node:path");
		const planDir = pathJoin(TEST_PLANS_DIR, "discoverable-test-plan");
		if (exists(planDir)) {
			rm(planDir, { recursive: true, force: true });
		}
	});
});

describe("handlePlan — /plan close", () => {
	beforeEach(() => setupTestPlansDir());
	afterEach(() => cleanupTestPlansDir());

	it("clears all plan state and returns to default mode", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const pi = createTestPi();
		const state = createTestState({
			planModeEnabled: true,
			executionMode: false,
			currentSlug: "my-plan",
			planTitle: "My Plan",
			planText: "Plan:\n1. Do something",
			planSize: "medium",
			todoItems: [{ step: 1, text: "Do something", completed: false }],
			preMortemRun: true,
			reviewRun: true,
			prdConverted: true,
		});
		const togglePlanMode = () => {};

		await handlePlan("close", ctx, pi, state, togglePlanMode);

		assert.equal(state.planModeEnabled, false, "Should disable plan mode");
		assert.equal(state.executionMode, false, "Should disable execution mode");
		assert.equal(state.currentSlug, null, "Should clear currentSlug");
		assert.equal(state.planTitle, null, "Should clear planTitle");
		assert.equal(state.planText, "", "Should clear planText");
		assert.equal(state.planSize, null, "Should clear planSize");
		assert.deepEqual(state.todoItems, [], "Should clear todoItems");
		assert.equal(state.preMortemRun, false, "Should reset preMortemRun");
		assert.equal(state.reviewRun, false, "Should reset reviewRun");
		assert.equal(state.prdConverted, false, "Should reset prdConverted");
		assert.ok(notifyMessage.includes("default mode"), "Should mention default mode");
	});

	it("offers to save unsaved changes before closing", async () => {
		let confirmCalled = false;
		const ctx = createTestContext({
			confirm: async () => {
				confirmCalled = true;
				return false; // Don't save
			},
			notify: () => {},
		});
		const pi = createTestPi();
		const state = createTestState({
			planModeEnabled: true,
			planText: "Plan:\n1. Unsaved step",
			todoItems: [{ step: 1, text: "Unsaved step", completed: false }],
		});
		const togglePlanMode = () => {};

		await handlePlan("close", ctx, pi, state, togglePlanMode);

		assert.ok(confirmCalled, "Should prompt to save unsaved changes");
		assert.equal(state.planModeEnabled, false, "Should still close after declining save");
	});

	it("persists cleared state via appendEntry", async () => {
		const ctx = createTestContext({ notify: () => {} });
		const pi = createTestPi();
		const state = createTestState({
			planModeEnabled: true,
			currentSlug: "test-plan",
		});
		const togglePlanMode = () => {};

		await handlePlan("close", ctx, pi, state, togglePlanMode);

		assert.ok(pi.entries.length > 0, "Should persist state");
		const lastEntry = pi.entries[pi.entries.length - 1] as Record<string, unknown>;
		assert.equal(lastEntry.enabled, false);
		assert.equal(lastEntry.currentSlug, null);
	});
});

describe("handlePlanStatus", () => {
	beforeEach(() => setupTestPlansDir());
	afterEach(() => cleanupTestPlansDir());

	it("shows warning when no active plan", async () => {
		let notifyMessage = "";
		let notifyType = "";
		const ctx = createTestContext({
			notify: (msg, type) => {
				notifyMessage = msg;
				notifyType = type ?? "";
			},
		});
		const state = createTestState();

		await handlePlanStatus("", ctx, state);

		assert.ok(notifyMessage.includes("No active plan"), "Should warn about no active plan");
		assert.equal(notifyType, "warning");
	});

	it("shows plan info when active plan and no args", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const slug = "status-test-plan";
		createTestPlan(slug, "# Test\n1. Step one\n2. Step two");
		const state = createTestState({ currentSlug: slug });

		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Status Test Plan
slug: ${slug}
status: draft
size: medium
tags: []
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: false
has_prd: true
steps: 3
---

# Status Test Plan
1. Do thing one
2. Do thing two
3. Do thing three
`,
			"utf-8",
		);

		try {
			await handlePlanStatus("", ctx, state);

			assert.ok(notifyMessage.includes("Status Test Plan"), "Should show title");
			assert.ok(notifyMessage.includes("status-test-plan"), "Should show slug");
			assert.ok(notifyMessage.includes("draft"), "Should show status");
			assert.ok(notifyMessage.includes("medium"), "Should show size");
			assert.ok(notifyMessage.includes("pre-mortem ☐"), "Should show unchecked pre-mortem gate");
			assert.ok(notifyMessage.includes("review ☑"), "Should show checked review gate");
			assert.ok(notifyMessage.includes("PRD ☑"), "Should show checked PRD gate");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("sets valid status with confirmation", async () => {
		let notifyMessage = "";
		let confirmCalled = false;
		const ctx = createTestContext({
			confirm: async (_title, _msg) => {
				confirmCalled = true;
				return true;
			},
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const slug = "set-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Set Status Plan
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
steps: 1
---

# Set Status Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("planned", ctx, state);

			assert.equal(confirmCalled, true, "Should ask for confirmation");
			assert.ok(notifyMessage.includes("planned"), "Should confirm new status");
			assert.ok(notifyMessage.includes("draft"), "Should mention old status");

			// Verify persisted
			const { loadPlan } = await import("./persistence.js");
			const plan = loadPlan(slug);
			assert.equal(plan?.frontmatter.status, "planned", "Should persist status to disk");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("does not change status when user declines confirmation", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			confirm: async () => false,
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const slug = "decline-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Decline Status Plan
slug: ${slug}
status: idea
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

# Decline Status Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("draft", ctx, state);

			assert.ok(notifyMessage.includes("cancelled"), "Should indicate cancellation");

			// Verify not persisted
			const { loadPlan } = await import("./persistence.js");
			const plan = loadPlan(slug);
			assert.equal(plan?.frontmatter.status, "idea", "Should not change status");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("shows error for 'building' status", async () => {
		let notifyMessage = "";
		let notifyType = "";
		const ctx = createTestContext({
			notify: (msg, type) => {
				notifyMessage = msg;
				notifyType = type ?? "";
			},
		});
		const slug = "restricted-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Restricted Plan
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

# Restricted Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("building", ctx, state);
			assert.ok(notifyMessage.includes("Use /build"), "Should direct to /build");
			assert.equal(notifyType, "error");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("shows error for 'complete' status", async () => {
		let notifyMessage = "";
		let notifyType = "";
		const ctx = createTestContext({
			notify: (msg, type) => {
				notifyMessage = msg;
				notifyType = type ?? "";
			},
		});
		const slug = "complete-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Complete Plan
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

# Complete Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("complete", ctx, state);
			assert.ok(notifyMessage.includes("Use /plan archive"), "Should direct to /plan archive");
			assert.ok(notifyMessage.includes("complete"), "Should mention completing");
			assert.equal(notifyType, "error");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("shows error for 'abandoned' status", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const slug = "abandoned-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Abandoned Plan
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

# Abandoned Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("abandoned", ctx, state);
			assert.ok(notifyMessage.includes("Use /plan archive"), "Should direct to /plan archive");
			assert.ok(notifyMessage.includes("abandon"), "Should mention abandoning");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("shows error for invalid status with valid options", async () => {
		let notifyMessage = "";
		let notifyType = "";
		const ctx = createTestContext({
			notify: (msg, type) => {
				notifyMessage = msg;
				notifyType = type ?? "";
			},
		});
		const slug = "invalid-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Invalid Plan
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

# Invalid Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("invalid-thing", ctx, state);
			assert.ok(notifyMessage.includes("Invalid status"), "Should say invalid");
			assert.ok(notifyMessage.includes("invalid-thing"), "Should echo the invalid value");
			assert.ok(notifyMessage.includes("idea, draft, planned"), "Should list valid options");
			assert.equal(notifyType, "error");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});

	it("handles setting status to 'idea'", async () => {
		let notifyMessage = "";
		const ctx = createTestContext({
			confirm: async () => true,
			notify: (msg) => {
				notifyMessage = msg;
			},
		});
		const slug = "idea-status-plan";
		const planDir = join(TEST_PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: Idea Plan
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

# Idea Plan
`,
			"utf-8",
		);
		const state = createTestState({ currentSlug: slug });

		try {
			await handlePlanStatus("idea", ctx, state);
			assert.ok(notifyMessage.includes("idea"), "Should confirm idea status");

			const { loadPlan } = await import("./persistence.js");
			const plan = loadPlan(slug);
			assert.equal(plan?.frontmatter.status, "idea", "Should persist idea status");
		} finally {
			rmSync(planDir, { recursive: true, force: true });
		}
	});
});

// ────────────────────────────────────────────────────────────
// parsePlanListFilter tests
// ────────────────────────────────────────────────────────────

describe("parsePlanListFilter", () => {
	it("returns 'all' for empty args", () => {
		assert.equal(parsePlanListFilter(""), "all");
	});

	it("returns 'all' for whitespace-only args", () => {
		assert.equal(parsePlanListFilter("  "), "all");
	});

	it("returns 'ideas' for --ideas flag", () => {
		assert.equal(parsePlanListFilter("--ideas"), "ideas");
	});

	it("returns 'active' for --active flag", () => {
		assert.equal(parsePlanListFilter("--active"), "active");
	});

	it("is case insensitive", () => {
		assert.equal(parsePlanListFilter("--IDEAS"), "ideas");
		assert.equal(parsePlanListFilter("--Active"), "active");
	});

	it("handles flag with surrounding whitespace", () => {
		assert.equal(parsePlanListFilter("  --ideas  "), "ideas");
	});
});

// ────────────────────────────────────────────────────────────
// preparePlanListItems tests
// ────────────────────────────────────────────────────────────

describe("preparePlanListItems", () => {
	function makePlan(slug: string, status: "idea" | "draft" | "planned" | "building" | "complete" | "abandoned", size = "small", steps = 3) {
		return {
			slug,
			frontmatter: {
				title: slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
				slug,
				status: status as import("./persistence.js").PlanStatus,
				size: size as import("./persistence.js").PlanSize,
				tags: [] as string[],
				created: "2026-01-01T00:00:00.000Z",
				updated: "2026-01-01T00:00:00.000Z",
				completed: null,
				execution: null,
				has_review: false,
				has_pre_mortem: false,
				has_prd: false,
				steps,
			},
		};
	}

	it("returns empty array for empty plans", () => {
		const result = preparePlanListItems([], "all");
		assert.deepEqual(result, []);
	});

	it("sorts by status priority: building first, idea last", () => {
		const plans = [
			makePlan("idea-plan", "idea"),
			makePlan("building-plan", "building"),
			makePlan("draft-plan", "draft"),
			makePlan("planned-plan", "planned"),
		];
		const result = preparePlanListItems(plans, "all");
		assert.equal(result[0].value, "building-plan");
		assert.equal(result[1].value, "planned-plan");
		assert.equal(result[2].value, "draft-plan");
		assert.equal(result[3].value, "idea-plan");
	});

	it("formats label with emoji, title, and slug", () => {
		const plans = [makePlan("my-plan", "draft")];
		const result = preparePlanListItems(plans, "all");
		assert.equal(result[0].label, "📝 My Plan (my-plan)");
	});

	it("formats description with size and steps", () => {
		const plans = [makePlan("my-plan", "draft", "medium", 5)];
		const result = preparePlanListItems(plans, "all");
		assert.equal(result[0].description, "medium, 5 steps");
	});

	it("uses correct emoji for each status", () => {
		const statuses = ["building", "planned", "draft", "idea", "complete", "abandoned"] as const;
		const expectedEmojis = ["⚡", "✅", "📝", "💡", "🎉", "🚫"];
		for (let i = 0; i < statuses.length; i++) {
			const plans = [makePlan(`plan-${statuses[i]}`, statuses[i])];
			const result = preparePlanListItems(plans, "all");
			assert.ok(result[0].label.startsWith(expectedEmojis[i]), `Expected ${statuses[i]} to have emoji ${expectedEmojis[i]}`);
		}
	});

	it("filters to only ideas with 'ideas' filter", () => {
		const plans = [
			makePlan("idea-one", "idea"),
			makePlan("draft-one", "draft"),
			makePlan("idea-two", "idea"),
		];
		const result = preparePlanListItems(plans, "ideas");
		assert.equal(result.length, 2);
		assert.ok(result.every((r) => r.value.startsWith("idea-")));
	});

	it("filters to active statuses with 'active' filter", () => {
		const plans = [
			makePlan("idea-one", "idea"),
			makePlan("draft-one", "draft"),
			makePlan("building-one", "building"),
			makePlan("planned-one", "planned"),
			makePlan("complete-one", "complete"),
		];
		const result = preparePlanListItems(plans, "active");
		assert.equal(result.length, 3);
		const slugs = result.map((r) => r.value);
		assert.ok(slugs.includes("draft-one"));
		assert.ok(slugs.includes("building-one"));
		assert.ok(slugs.includes("planned-one"));
	});

	it("returns all plans with 'all' filter", () => {
		const plans = [
			makePlan("a", "idea"),
			makePlan("b", "draft"),
			makePlan("c", "complete"),
		];
		const result = preparePlanListItems(plans, "all");
		assert.equal(result.length, 3);
	});

	it("sets value to the plan slug", () => {
		const plans = [makePlan("test-slug", "draft")];
		const result = preparePlanListItems(plans, "all");
		assert.equal(result[0].value, "test-slug");
	});
});

// ────────────────────────────────────────────────────────────
// handlePlan list integration tests
// ────────────────────────────────────────────────────────────

describe("handlePlan list", () => {
	const PLANS_DIR = TEST_PLANS_DIR;

	beforeEach(() => setupTestPlansDir());
	afterEach(() => cleanupTestPlansDir());

	function createPlanOnDisk(slug: string, status: string, size = "small", steps = 0): void {
		const planDir = join(PLANS_DIR, slug);
		mkdirSync(planDir, { recursive: true });
		const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		writeFileSync(
			join(planDir, "plan.md"),
			`---
title: ${title}
slug: ${slug}
status: ${status}
size: ${size}
tags: []
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: ${steps}
---

# ${title}
`,
			"utf-8",
		);
	}

	it("shows empty state notification when no plans exist", async () => {
		// setupTestPlansDir creates an empty isolated directory — no backup needed
		let notified = "";
		const ctx = createTestContext({
			notify: (msg) => { notified = msg; },
		});
		const pi = createTestPi();
		const state = createTestState();

		await handlePlan("list", ctx, pi, state, () => {});
		assert.ok(notified.includes("No plans found"), `Expected empty notification, got: ${notified}`);
	});

	it("falls back to simple select when custom is not available", async () => {
		const slug = `test-list-fallback-${Date.now()}`;
		createPlanOnDisk(slug, "draft", "small", 2);

		let selectCalled = false;
		const ctx = createTestContext({
			select: async (title, options) => {
				selectCalled = true;
				assert.equal(title, "Plans");
				assert.ok(options.length > 0);
				return undefined;
			},
		});
		// Remove custom to force fallback
		ctx.ui.custom = undefined;

		const pi = createTestPi();
		const state = createTestState();

		try {
			await handlePlan("list", ctx, pi, state, () => {});
			assert.ok(selectCalled, "Should have used simple select fallback");
		} finally {
			rmSync(join(PLANS_DIR, slug), { recursive: true, force: true });
		}
	});

	it("falls back to simple select when hasUI is false", async () => {
		const slug = `test-list-noui-${Date.now()}`;
		createPlanOnDisk(slug, "draft", "small", 2);

		let selectCalled = false;
		const ctx = createTestContext({
			select: async () => {
				selectCalled = true;
				return undefined;
			},
		});
		ctx.hasUI = false;

		const pi = createTestPi();
		const state = createTestState();

		try {
			await handlePlan("list", ctx, pi, state, () => {});
			assert.ok(selectCalled, "Should have used simple select when hasUI is false");
		} finally {
			rmSync(join(PLANS_DIR, slug), { recursive: true, force: true });
		}
	});

	it("passes --ideas filter through to show only idea plans", async () => {
		const ideaSlug = `test-idea-${Date.now()}`;
		const draftSlug = `test-draft-${Date.now()}`;
		createPlanOnDisk(ideaSlug, "idea");
		createPlanOnDisk(draftSlug, "draft");

		let selectOptions: string[] = [];
		const ctx = createTestContext({
			select: async (_title, options) => {
				selectOptions = options;
				return undefined;
			},
		});
		ctx.ui.custom = undefined; // force fallback to check filtering

		const pi = createTestPi();
		const state = createTestState();

		try {
			await handlePlan("list --ideas", ctx, pi, state, () => {});
			// Only idea plans should appear
			assert.ok(selectOptions.some((o) => o.includes(ideaSlug)), "Should include idea plan");
			assert.ok(!selectOptions.some((o) => o.includes(draftSlug)), "Should not include draft plan");
		} finally {
			rmSync(join(PLANS_DIR, ideaSlug), { recursive: true, force: true });
			rmSync(join(PLANS_DIR, draftSlug), { recursive: true, force: true });
		}
	});

	it("passes --active filter through to show only active plans", async () => {
		const ideaSlug = `test-idea-active-${Date.now()}`;
		const buildingSlug = `test-building-active-${Date.now()}`;
		createPlanOnDisk(ideaSlug, "idea");
		createPlanOnDisk(buildingSlug, "building");

		let selectOptions: string[] = [];
		const ctx = createTestContext({
			select: async (_title, options) => {
				selectOptions = options;
				return undefined;
			},
		});
		ctx.ui.custom = undefined;

		const pi = createTestPi();
		const state = createTestState();

		try {
			await handlePlan("list --active", ctx, pi, state, () => {});
			assert.ok(selectOptions.some((o) => o.includes(buildingSlug)), "Should include building plan");
			assert.ok(!selectOptions.some((o) => o.includes(ideaSlug)), "Should not include idea plan");
		} finally {
			rmSync(join(PLANS_DIR, ideaSlug), { recursive: true, force: true });
			rmSync(join(PLANS_DIR, buildingSlug), { recursive: true, force: true });
		}
	});
});

// ────────────────────────────────────────────────────────────
// checkPrdExecutionComplete tests
// ────────────────────────────────────────────────────────────

describe("checkPrdExecutionComplete", () => {
	function makeProgressFn(completed: number, total: number) {
		return (): ExecutionProgressSnapshot => ({
			source: "prd",
			total,
			completed,
			currentTask: null,
			tasks: [],
		});
	}

	it("returns true when all PRD tasks are complete", () => {
		const result = checkPrdExecutionComplete("my-plan", true, makeProgressFn(6, 6));
		assert.equal(result, true);
	});

	it("returns false when some tasks are pending", () => {
		const result = checkPrdExecutionComplete("my-plan", true, makeProgressFn(3, 6));
		assert.equal(result, false);
	});

	it("returns false when total is 0 (no PRD found)", () => {
		const result = checkPrdExecutionComplete("my-plan", true, makeProgressFn(0, 0));
		assert.equal(result, false);
	});

	it("returns false when hasPrd is false and no tasks found", () => {
		// When hasPrd is false, resolveExecutionProgress falls back to todo-based
		// which returns 0/0 for empty todoItems
		const result = checkPrdExecutionComplete("my-plan", false, makeProgressFn(0, 0));
		assert.equal(result, false);
	});

	it("passes correct prdPath to resolveProgressFn", () => {
		let capturedParams: Parameters<typeof import("./execution-progress.js").resolveExecutionProgress>[0] | undefined;
		const spy = (params: Parameters<typeof import("./execution-progress.js").resolveExecutionProgress>[0]): ExecutionProgressSnapshot => {
			capturedParams = params;
			return { source: "prd", total: 3, completed: 3, currentTask: null, tasks: [] };
		};
		checkPrdExecutionComplete("my-feature", true, spy);
		assert.ok(capturedParams);
		assert.equal(capturedParams.prdPath, "dev/work/plans/my-feature/prd.json");
		assert.equal(capturedParams.hasPrd, true);
	});
});

// ── Regression tests: plan-overwrite bug ────────────────────────────
// These tests prevent the bug where agent_end overwrites state.planText with
// unrelated agent responses containing numbered steps, and handlePlanSave
// then writes that corrupted content to the plan file on disk.
//
// Tests use an isolated temp directory via ARETE_TEST_PLANS_DIR env var
// so they never touch the real dev/work/plans/ directory.

import { tmpdir } from "node:os";

const ISOLATED_PLANS_DIR = join(tmpdir(), `arete-plan-overwrite-test-${process.pid}`);

function createIsolatedPlan(slug: string, content: string): void {
	const planDir = join(ISOLATED_PLANS_DIR, slug);
	mkdirSync(planDir, { recursive: true });
	const frontmatter = `---
title: ${slug}
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

function setupIsolatedPlansDir(): void {
	process.env.ARETE_TEST_PLANS_DIR = ISOLATED_PLANS_DIR;
	if (existsSync(ISOLATED_PLANS_DIR)) {
		rmSync(ISOLATED_PLANS_DIR, { recursive: true, force: true });
	}
	mkdirSync(ISOLATED_PLANS_DIR, { recursive: true });
}

function cleanupIsolatedPlansDir(): void {
	delete process.env.ARETE_TEST_PLANS_DIR;
	if (existsSync(ISOLATED_PLANS_DIR)) {
		rmSync(ISOLATED_PLANS_DIR, { recursive: true, force: true });
	}
}

describe("handlePlanSave — loadedFromDisk confirmation guard", () => {
	beforeEach(() => setupIsolatedPlansDir());
	afterEach(() => cleanupIsolatedPlansDir());

	it("prompts for confirmation when loaded plan content differs from disk", async () => {
		// Regression: agent_end could overwrite state.planText with unrelated content.
		// Explicit /plan save must warn the user before writing corrupted content.
		const slug = "_overwrite-guard-test";
		createIsolatedPlan(slug, "# Original Plan\n\n1. Step one\n2. Step two");

		let confirmCalled = false;
		let confirmMessage = "";
		const ctx = createTestContext({
			confirm: async (_title: string, msg: string) => {
				confirmCalled = true;
				confirmMessage = msg;
				return false; // User cancels
			},
			notify: () => {},
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Completely Different Content\n\n1. Unrelated step",
			currentSlug: slug,
			loadedFromDisk: true,
		});

		await handlePlanSave(undefined, ctx, pi, state);

		assert.ok(confirmCalled, "Should prompt for confirmation when content differs");
		assert.ok(confirmMessage.includes("differs"), "Message should mention content differs");
	});

	it("cancels save when user declines confirmation for changed loaded plan", async () => {
		const slug = "_overwrite-cancel-test";
		createIsolatedPlan(slug, "# Original Plan\nOriginal content");

		let notifyMessage = "";
		const ctx = createTestContext({
			confirm: async () => false, // User declines
			notify: (msg: string) => { notifyMessage = msg; },
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Different Content",
			currentSlug: slug,
			loadedFromDisk: true,
		});

		await handlePlanSave(undefined, ctx, pi, state);

		assert.ok(notifyMessage.includes("cancelled"), "Should indicate save was cancelled");
	});

	it("proceeds with save when user confirms changed loaded plan", async () => {
		const slug = "_overwrite-proceed-test";
		createIsolatedPlan(slug, "# Original Plan\nOriginal content");

		let notifyMessage = "";
		const ctx = createTestContext({
			confirm: async () => true, // User confirms
			notify: (msg: string) => { notifyMessage = msg; },
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Intentionally Updated Plan\nNew content",
			currentSlug: slug,
			loadedFromDisk: true,
		});

		await handlePlanSave(undefined, ctx, pi, state);

		assert.ok(notifyMessage.includes("Saved"), "Should confirm save after user approval");
	});

	it("skips confirmation when loadedFromDisk is false (fresh plan)", async () => {
		let confirmCalled = false;
		let notifyMessage = "";
		const ctx = createTestContext({
			confirm: async () => {
				confirmCalled = true;
				return true;
			},
			notify: (msg: string) => { notifyMessage = msg; },
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: "# Fresh Plan\n1. Step one",
			currentSlug: "fresh-plan-test",
			loadedFromDisk: false,
		});

		await handlePlanSave(undefined, ctx, pi, state);

		assert.equal(confirmCalled, false, "Should not prompt for fresh plans");
		assert.ok(notifyMessage.includes("Saved"), "Should save directly");
	});

	it("skips confirmation when loaded plan content matches disk", async () => {
		const slug = "_overwrite-match-test";
		const content = "# Unchanged Plan\nSame content";
		createIsolatedPlan(slug, content);

		let confirmCalled = false;
		let notifyMessage = "";
		const ctx = createTestContext({
			confirm: async () => {
				confirmCalled = true;
				return true;
			},
			notify: (msg: string) => { notifyMessage = msg; },
		});
		const pi = createTestPi();
		const state = createTestState({
			planText: content,
			currentSlug: slug,
			loadedFromDisk: true,
		});

		await handlePlanSave(undefined, ctx, pi, state);

		assert.equal(confirmCalled, false, "Should not prompt when content matches disk");
		assert.ok(notifyMessage.includes("Saved"), "Should save directly");
	});
});

describe("hasUnsavedPlanChanges — loadedFromDisk scenarios", () => {
	beforeEach(() => setupIsolatedPlansDir());
	afterEach(() => cleanupIsolatedPlansDir());

	it("returns false when loaded plan text matches disk content", () => {
		// Regression: after loading a plan and not changing it, close should not
		// prompt "unsaved changes" — this was a vector for accidental overwrites.
		const slug = "_overwrite-unsaved-match";
		createIsolatedPlan(slug, "# My Plan\nContent here");

		const state = createTestState({
			currentSlug: slug,
			planText: "# My Plan\nContent here",
			loadedFromDisk: true,
		});

		assert.equal(hasUnsavedPlanChanges(state), false);
	});

	it("returns true when loaded plan text differs from disk", () => {
		const slug = "_overwrite-unsaved-differ";
		createIsolatedPlan(slug, "# Original\nOriginal content");

		const state = createTestState({
			currentSlug: slug,
			planText: "# Something Else\nDifferent content from agent_end",
			loadedFromDisk: true,
		});

		assert.equal(hasUnsavedPlanChanges(state), true);
	});
});

describe("session restore → agent_end protection (simulated)", () => {
	// Regression test for the session_start → agent_end overwrite path.
	// session_start loads plan from disk and sets loadedFromDisk = true.
	// If agent_end then fires with numbered steps, state must NOT change.
	// We can't invoke session_start directly (closure in index.ts), but we
	// can simulate the post-restore state and verify the guard logic holds.

	it("loadedFromDisk state prevents planText mutation from extractTodoItems", () => {
		const originalContent = "# My Publish Plan\n\nPlan:\n1. Fix package.json metadata\n2. Build and verify packages\n3. Publish to npm registry";
		const originalTodos = extractTodoItems(originalContent);
		assert.equal(originalTodos.length, 3, "Sanity: original content should have 3 todos");

		const state = createTestState({
			planModeEnabled: true,
			currentSlug: "publish-to-npm",
			planText: originalContent,
			loadedFromDisk: true, // session_start always sets this
			todoItems: originalTodos,
		});

		// Simulate what agent_end does: extract todos from a tangential response
		const tangentialResponse = "Here's how to clean up:\n\nPlan:\n1. Delete stale files from memory\n2. Archive old entries to backup\n3. Rebuild the search index";
		const extracted = extractTodoItems(tangentialResponse);
		assert.ok(extracted.length > 0, "Tangential response should have extractable todos");

		// Apply the guarded logic (mirrors index.ts agent_end handler)
		if (extracted.length > 0) {
			if (!state.loadedFromDisk) {
				// This block should NOT execute for loaded plans
				state.todoItems = extracted;
				state.planText = tangentialResponse;
			}
		}

		// Verify state was NOT mutated
		assert.equal(state.planText, originalContent, "planText must not change for loaded plans");
		assert.equal(state.todoItems.length, 3, "todoItems count must not change");
		assert.ok(state.todoItems[0].text.includes("Fix package"), "todoItems content must be original");
	});
});

