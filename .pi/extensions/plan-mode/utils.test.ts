import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	isSafeCommand,
	isAllowedInPlanMode,
	shouldShowExecutionStatus,
	extractTodoItems,
	cleanStepText,
	extractDoneSteps,
	markCompletedSteps,
	extractPhaseContent,
	isAwaitingUserResponse,
	classifyPlanSize,
	getPhaseMenu,
	getMenuOptions,
	getPostExecutionMenuOptions,
	suggestPlanName,
	type TodoItem,
	type WorkflowMenuState,
} from "./utils.js";

// ────────────────────────────────────────────────────────────
// Existing utils
// ────────────────────────────────────────────────────────────

describe("isSafeCommand", () => {
	it("allows read-only commands", () => {
		assert.equal(isSafeCommand("cat file.txt"), true);
		assert.equal(isSafeCommand("ls -la"), true);
		assert.equal(isSafeCommand("grep -r 'foo' src/"), true);
		assert.equal(isSafeCommand("git status"), true);
		assert.equal(isSafeCommand("npm test"), true);
		assert.equal(isSafeCommand("rg pattern"), true);
	});

	it("blocks destructive commands", () => {
		assert.equal(isSafeCommand("rm -rf /"), false);
		assert.equal(isSafeCommand("git commit -m 'test'"), false);
		assert.equal(isSafeCommand("npm install foo"), false);
		assert.equal(isSafeCommand("mv file1 file2"), false);
	});

	it("blocks commands not in allowlist", () => {
		assert.equal(isSafeCommand("some-unknown-cmd"), false);
	});

	it("allows npm run typecheck", () => {
		assert.equal(isSafeCommand("npm run typecheck"), true);
	});

	it("allows npm run test:all", () => {
		assert.equal(isSafeCommand("npm run test:all"), true);
	});
});

describe("isAllowedInPlanMode", () => {
	it("allows safe read-only commands during normal plan mode", () => {
		assert.equal(isAllowedInPlanMode("ls -la", null), true);
	});

	it("allows mkdir -p only during prd command", () => {
		assert.equal(isAllowedInPlanMode("mkdir -p dev/prds/plan-mode-ux", "prd"), true);
		assert.equal(isAllowedInPlanMode("mkdir -p dev/prds/plan-mode-ux", null), false);
	});

	it("still blocks dangerous commands during prd command", () => {
		assert.equal(isAllowedInPlanMode("rm -rf /", "prd"), false);
	});
});

describe("shouldShowExecutionStatus", () => {
	it("returns false when execution mode is off", () => {
		assert.equal(shouldShowExecutionStatus(false, "in-progress", "build"), false);
	});

	it("returns true for in-progress plans", () => {
		assert.equal(shouldShowExecutionStatus(true, "in-progress", "plan"), true);
	});

	it("returns true when current phase is build", () => {
		assert.equal(shouldShowExecutionStatus(true, "draft", "build"), true);
	});

	it("returns false for stale execution flags on non-build phases", () => {
		assert.equal(shouldShowExecutionStatus(true, "draft", "plan"), false);
	});
});

describe("extractTodoItems", () => {
	it("extracts items from Plan: header", () => {
		const message = `Here is my plan:

Plan:
1. **Create the module** — first step
2. **Add tests** — second step
3. **Wire it up** — third step
`;
		const items = extractTodoItems(message);
		assert.equal(items.length, 3);
		assert.equal(items[0].step, 1);
		assert.equal(items[1].step, 2);
		assert.equal(items[2].step, 3);
	});

	it("returns empty array when no Plan: header", () => {
		const items = extractTodoItems("No plan here, just text.");
		assert.deepEqual(items, []);
	});

	it("handles bold Plan: header", () => {
		const message = `**Plan:**
1. **Step one** — do the thing
2. **Step two** — do another thing
`;
		const items = extractTodoItems(message);
		assert.equal(items.length, 2);
	});

	it("skips short text items", () => {
		const message = `Plan:
1. Hi
2. **Longer description here** — real step
`;
		const items = extractTodoItems(message);
		assert.equal(items.length, 1);
	});
});

describe("cleanStepText", () => {
	it("removes bold markers", () => {
		assert.equal(cleanStepText("**Bold text**"), "Bold text");
	});

	it("removes code backticks", () => {
		assert.equal(cleanStepText("`some code`"), "Some code");
	});

	it("truncates long text to 50 chars", () => {
		const long = "This is a very long step description that definitely exceeds the fifty character limit by quite a lot";
		const result = cleanStepText(long);
		assert.ok(result.length <= 50);
		assert.ok(result.endsWith("..."));
	});

	it("capitalizes first letter", () => {
		assert.equal(cleanStepText("lowercase start"), "Lowercase start");
	});

	it("strips action verbs at start", () => {
		const result = cleanStepText("Create the new module");
		assert.equal(result, "New module");
	});
});

describe("extractDoneSteps", () => {
	it("extracts done step numbers", () => {
		const steps = extractDoneSteps("I completed step [DONE:1] and [DONE:2].");
		assert.deepEqual(steps, [1, 2]);
	});

	it("returns empty for no markers", () => {
		const steps = extractDoneSteps("Nothing done yet.");
		assert.deepEqual(steps, []);
	});

	it("is case-insensitive", () => {
		const steps = extractDoneSteps("[done:3]");
		assert.deepEqual(steps, [3]);
	});
});

describe("markCompletedSteps", () => {
	it("marks matching items as completed", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "Step 1", completed: false },
			{ step: 2, text: "Step 2", completed: false },
			{ step: 3, text: "Step 3", completed: false },
		];
		const count = markCompletedSteps("[DONE:1] [DONE:3]", items);
		assert.equal(count, 2);
		assert.equal(items[0].completed, true);
		assert.equal(items[1].completed, false);
		assert.equal(items[2].completed, true);
	});

	it("returns 0 when no markers", () => {
		const items: TodoItem[] = [{ step: 1, text: "Step 1", completed: false }];
		const count = markCompletedSteps("no markers here", items);
		assert.equal(count, 0);
		assert.equal(items[0].completed, false);
	});
});

describe("extractPhaseContent", () => {
	it("extracts plan section when Plan header exists", () => {
		const response = `Intro\n\nPlan:\n1. Step one\n2. Step two\n\n## Notes\nOther content`;
		const extracted = extractPhaseContent(response, "plan");
		assert.ok(extracted.startsWith("Plan:"));
		assert.ok(extracted.includes("1. Step one"));
	});

	it("extracts pre-mortem section from heading", () => {
		const response = `Some preface\n\n## Pre-Mortem\n### Risk 1\n- Something\n\n## Next`;
		const extracted = extractPhaseContent(response, "pre-mortem");
		assert.ok(extracted.startsWith("## Pre-Mortem"));
		assert.ok(extracted.includes("### Risk 1"));
	});

	it("falls back to full response when no header found", () => {
		const response = "Unstructured output without expected headers";
		const extracted = extractPhaseContent(response, "review");
		assert.equal(extracted, response);
	});
});

describe("isAwaitingUserResponse", () => {
	it("returns true for explicit clarifying questions", () => {
		const message = `Great start. Before I adapt this, I have a few clarifying questions:\n1. What is the target module?\n2. Should I optimize for speed or readability?`;
		assert.equal(isAwaitingUserResponse(message), true);
	});

	it("returns false for a plain plan with no questions", () => {
		const message = `Plan:\n1. Inspect current behavior\n2. Add regression test\n3. Implement fix`;
		assert.equal(isAwaitingUserResponse(message), false);
	});
});

describe("suggestPlanName", () => {
	it("uses specific heading when available", () => {
		const name = suggestPlanName("# Improve plan mode autosave\n\nPlan:\n1. Save\n", []);
		assert.equal(name, "Improve plan mode autosave");
	});

	it("falls back to todo text for generic heading", () => {
		const name = suggestPlanName("# Refactor\n\nPlan:\n1. Improve slug naming\n2. Save plan before gates", [
			{ step: 1, text: "Improve slug naming", completed: false },
			{ step: 2, text: "Save plan before gates", completed: false },
		]);
		assert.ok(name.includes("Improve slug naming"));
	});

	it("returns default when no heading or todos", () => {
		const name = suggestPlanName("", []);
		assert.equal(name, "New Plan");
	});
});

// ────────────────────────────────────────────────────────────
// Plan classification
// ────────────────────────────────────────────────────────────

function makeItems(count: number): TodoItem[] {
	return Array.from({ length: count }, (_, i) => ({
		step: i + 1,
		text: `Step ${i + 1}`,
		completed: false,
	}));
}

describe("classifyPlanSize", () => {
	it("0 steps → tiny", () => {
		assert.equal(classifyPlanSize([], ""), "tiny");
	});

	it("1 step, no keywords → tiny", () => {
		assert.equal(classifyPlanSize(makeItems(1), "Fix the button"), "tiny");
	});

	it("2 steps, no keywords → tiny", () => {
		assert.equal(classifyPlanSize(makeItems(2), "Update the config and restart"), "tiny");
	});

	it("3 steps, no keywords → medium", () => {
		assert.equal(classifyPlanSize(makeItems(3), "Add feature, test, deploy"), "medium");
	});

	it("2 steps with 'integration' keyword → medium", () => {
		assert.equal(classifyPlanSize(makeItems(2), "Add Slack integration"), "medium");
	});

	it("4 steps, no keywords → medium", () => {
		assert.equal(classifyPlanSize(makeItems(4), "Four simple steps"), "medium");
	});

	it("5 steps, no keywords → medium", () => {
		assert.equal(classifyPlanSize(makeItems(5), "Five steps to do"), "medium");
	});

	it("6 steps → large", () => {
		assert.equal(classifyPlanSize(makeItems(6), "Six step plan"), "large");
	});

	it("3 steps with 'new system' and 'migration' → large", () => {
		assert.equal(classifyPlanSize(makeItems(3), "Build new system with migration"), "large");
	});

	it("1 step with keyword → medium", () => {
		assert.equal(classifyPlanSize(makeItems(1), "Major refactor of the codebase"), "medium");
	});

	it("10 steps → large", () => {
		assert.equal(classifyPlanSize(makeItems(10), "Big plan"), "large");
	});
});

// ────────────────────────────────────────────────────────────
// Menu options
// ────────────────────────────────────────────────────────────

function makeMenuState(overrides: Partial<WorkflowMenuState> = {}): WorkflowMenuState {
	return {
		planSize: "small",
		preMortemRun: false,
		reviewRun: false,
		prdConverted: false,
		postMortemRun: false,
		...overrides,
	};
}

describe("getPhaseMenu", () => {
	it("plan phase (tiny): refine + continue to pre-mortem", () => {
		const menu = getPhaseMenu("plan", "tiny");
		assert.deepEqual(menu, {
			refine: "Refine plan",
			next: "Continue to pre-mortem",
		});
	});

	it("plan phase (large): refine + continue to PRD", () => {
		const menu = getPhaseMenu("plan", "large");
		assert.deepEqual(menu, {
			refine: "Refine plan",
			next: "Continue to PRD",
		});
	});

	it("prd phase: refine + continue to pre-mortem", () => {
		const menu = getPhaseMenu("prd", "medium");
		assert.deepEqual(menu, {
			refine: "Refine PRD",
			next: "Continue to pre-mortem",
		});
	});

	it("prd phase after out-of-order pre-mortem: next is continue to review", () => {
		const menu = getPhaseMenu("prd", "large", {
			prdConverted: true,
			preMortemRun: true,
			reviewRun: false,
		});
		assert.deepEqual(menu, {
			refine: "Refine PRD",
			next: "Continue to review",
		});
	});

	it("prd phase after pre-mortem and review: next is continue to build", () => {
		const menu = getPhaseMenu("prd", "large", {
			prdConverted: true,
			preMortemRun: true,
			reviewRun: true,
		});
		assert.deepEqual(menu, {
			refine: "Refine PRD",
			next: "Continue to build",
		});
	});

	it("pre-mortem phase (small): refine + skip review to build", () => {
		const menu = getPhaseMenu("pre-mortem", "small");
		assert.deepEqual(menu, {
			refine: "Refine pre-mortem",
			next: "Skip review → build",
		});
	});

	it("pre-mortem phase (small) with review already done: continue to build", () => {
		const menu = getPhaseMenu("pre-mortem", "small", {
			prdConverted: false,
			preMortemRun: true,
			reviewRun: true,
		});
		assert.deepEqual(menu, {
			refine: "Refine pre-mortem",
			next: "Continue to build",
		});
	});

	it("pre-mortem phase (large): refine + continue to review", () => {
		const menu = getPhaseMenu("pre-mortem", "large");
		assert.deepEqual(menu, {
			refine: "Refine pre-mortem",
			next: "Continue to review",
		});
	});

	it("review phase: refine + continue to build", () => {
		const menu = getPhaseMenu("review", "medium");
		assert.deepEqual(menu, {
			refine: "Refine review",
			next: "Continue to build",
		});
	});

	it("build/done: returns null options", () => {
		assert.deepEqual(getPhaseMenu("build", "medium"), { refine: null, next: null });
		assert.deepEqual(getPhaseMenu("done", "medium"), { refine: null, next: null });
	});
});

describe("getMenuOptions", () => {
	it("tiny: returns 3 options, first starts build with explicit warning", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "tiny" }));
		assert.equal(options.length, 3);
		assert.equal(options[0], "Start build now (executes code changes)");
		assert.ok(options.includes("Save as draft"));
		assert.ok(options.includes("Refine the plan"));
	});

	it("small: returns 6 options, includes non-destructive gate labels", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "small" }));
		assert.equal(options.length, 6);
		assert.ok(options.includes("Run pre-mortem (no code changes)"));
		assert.ok(options.includes("Review the plan"));
		assert.ok(options.includes("Convert to PRD (no code changes)"));
	});

	it("medium: first option is Convert to PRD with no-code-changes note", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "medium" }));
		assert.equal(options[0], "Convert to PRD (recommended, no code changes)");
	});

	it("large: first option is Convert to PRD with no-code-changes note", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "large" }));
		assert.equal(options[0], "Convert to PRD (recommended, no code changes)");
	});

	it("small + preMortemRun: hides pre-mortem prompt and keeps build path", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "small", preMortemRun: true }));
		assert.ok(!options.includes("Run pre-mortem (no code changes)"));
		assert.ok(options.includes("Start build now (pre-mortem ✓, executes code changes)"));
	});

	it("medium + reviewRun: Review not in options", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "medium", reviewRun: true }));
		assert.ok(!options.includes("Review the plan"));
	});

	it("large + prdConverted: Convert to PRD not in options", () => {
		const options = getMenuOptions(makeMenuState({ planSize: "large", prdConverted: true }));
		assert.ok(!options.some((o) => o.includes("Convert to PRD")));
	});

	it("all gates run: execute/save/refine remain without repeated pre-mortem prompt", () => {
		const options = getMenuOptions(
			makeMenuState({
				planSize: "large",
				preMortemRun: true,
				reviewRun: true,
				prdConverted: true,
			}),
		);
		assert.ok(!options.some((o) => o.includes("Convert to PRD")));
		assert.ok(!options.includes("Review the plan"));
		assert.ok(!options.includes("Run pre-mortem (no code changes)"));
		assert.ok(options.some((o) => o.includes("Start build now")));
		assert.ok(options.includes("Save as draft"));
		assert.ok(options.includes("Refine the plan"));
	});
});

describe("getPostExecutionMenuOptions", () => {
	it("default: 3 options including post-mortem", () => {
		const options = getPostExecutionMenuOptions(false);
		assert.equal(options.length, 3);
		assert.ok(options.includes("Run post-mortem (extract learnings)"));
		assert.ok(options.includes("Capture learnings to memory"));
		assert.ok(options.includes("Done"));
	});

	it("postMortemRun: post-mortem option removed", () => {
		const options = getPostExecutionMenuOptions(true);
		assert.equal(options.length, 2);
		assert.ok(!options.includes("Run post-mortem (extract learnings)"));
		assert.ok(options.includes("Capture learnings to memory"));
		assert.ok(options.includes("Done"));
	});
});
