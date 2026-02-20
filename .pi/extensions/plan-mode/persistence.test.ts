import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	slugify,
	savePlan,
	loadPlan,
	listPlans,
	updatePlanFrontmatter,
	savePlanArtifact,
	loadPlanArtifact,
	deletePlan,
	serializeFrontmatter,
	parseFrontmatter,
	parseFrontmatterFromFile,
	migrateStatus,
	listBacklog,
	listArchive,
	moveItem,
	promoteBacklogItem,
	shelveToBacklog,
	archiveItem,
	createBacklogItem,
	migrateBacklogToPlans,
	type PlanFrontmatter,
	type MigrationResult,
} from "./persistence.js";

function makeFrontmatter(overrides: Partial<PlanFrontmatter> = {}): PlanFrontmatter {
	return {
		title: "Test Plan",
		slug: "test-plan",
		status: "draft",
		size: "small",
		tags: [],
		created: "2026-02-16T15:00:00.000Z",
		updated: "2026-02-16T15:00:00.000Z",
		completed: null,
		execution: null,
		has_review: false,
		has_pre_mortem: false,
		has_prd: false,
		steps: 3,
		...overrides,
	};
}

describe("slugify", () => {
	it("converts title with spaces to kebab-case", () => {
		assert.equal(slugify("Slack Integration"), "slack-integration");
	});

	it("handles multiple words", () => {
		assert.equal(slugify("Add CLI command"), "add-cli-command");
	});

	it("passes through already-slugified strings", () => {
		assert.equal(slugify("already-slugified"), "already-slugified");
	});

	it("strips special characters", () => {
		assert.equal(slugify("Hello! World? (Yes)"), "hello-world-yes");
	});

	it("collapses multiple spaces/hyphens", () => {
		assert.equal(slugify("too   many   spaces"), "too-many-spaces");
		assert.equal(slugify("too---many---hyphens"), "too-many-hyphens");
	});

	it("handles uppercase", () => {
		assert.equal(slugify("UPPERCASE TITLE"), "uppercase-title");
	});

	it("trims leading/trailing whitespace", () => {
		assert.equal(slugify("  padded  "), "padded");
	});

	it("handles empty string", () => {
		assert.equal(slugify(""), "");
	});
});

describe("serializeFrontmatter / parseFrontmatter", () => {
	it("round-trips all field types", () => {
		const fm = makeFrontmatter();
		const serialized = serializeFrontmatter(fm);
		const parsed = parseFrontmatter(serialized);

		assert.equal(parsed.title, fm.title);
		assert.equal(parsed.slug, fm.slug);
		assert.equal(parsed.status, fm.status);
		assert.equal(parsed.size, fm.size);
		assert.equal(parsed.created, fm.created);
		assert.equal(parsed.steps, fm.steps);
		assert.equal(parsed.has_review, false);
		assert.equal(parsed.has_prd, false);
		assert.equal(parsed.completed, null);
	});

	it("handles boolean values", () => {
		const fm = makeFrontmatter({ has_review: true, has_pre_mortem: true });
		const serialized = serializeFrontmatter(fm);
		const parsed = parseFrontmatter(serialized);

		assert.equal(parsed.has_review, true);
		assert.equal(parsed.has_pre_mortem, true);
	});

	it("preserves current statuses through round-trip", () => {
		for (const status of ["idea", "draft", "planned", "building", "complete", "abandoned"] as const) {
			const fm = makeFrontmatter({ status });
			const serialized = serializeFrontmatter(fm);
			const parsed = parseFrontmatter(serialized);
			assert.equal(parsed.status, status, `status '${status}' should survive round-trip`);
		}
	});

	it("migrates legacy statuses to current equivalents", () => {
		const legacyMappings: Array<[string, string]> = [
			["planned", "planned"],
			["reviewed", "planned"],
			["approved", "planned"],
			["ready", "planned"],
			["in-progress", "building"],
			["completed", "complete"],
			["blocked", "draft"],
			["on-hold", "draft"],
		];

		for (const [legacy, expected] of legacyMappings) {
			const raw = `---\nstatus: ${legacy}\ntitle: Test\nslug: test\n---`;
			const parsed = parseFrontmatter(raw);
			assert.equal(parsed.status, expected, `legacy status '${legacy}' should migrate to '${expected}'`);
		}
	});

	it("falls back to draft for unknown statuses", () => {
		const raw = "---\nstatus: banana\ntitle: Test\nslug: test\n---";
		const parsed = parseFrontmatter(raw);
		assert.equal(parsed.status, "draft");
	});

	it("handles date strings with colons", () => {
		const fm = makeFrontmatter({ created: "2026-02-16T15:30:45.123Z" });
		const serialized = serializeFrontmatter(fm);
		const parsed = parseFrontmatter(serialized);

		assert.equal(parsed.created, "2026-02-16T15:30:45.123Z");
	});
});

describe("savePlan + loadPlan", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "plan-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("round-trips frontmatter and content", () => {
		const fm = makeFrontmatter();
		const content = "## My Plan\n\n1. Step one\n2. Step two";
		savePlan("test-plan", fm, content, tempDir);

		const loaded = loadPlan("test-plan", tempDir);
		assert.ok(loaded);
		assert.equal(loaded.frontmatter.title, "Test Plan");
		assert.equal(loaded.frontmatter.slug, "test-plan");
		assert.equal(loaded.frontmatter.status, "draft");
		assert.equal(loaded.frontmatter.steps, 3);
		assert.equal(loaded.frontmatter.has_review, false);
		assert.equal(loaded.frontmatter.completed, null);
		assert.equal(loaded.content, content);
	});

	it("creates nested directory if it doesn't exist", () => {
		const nestedBase = join(tempDir, "nested", "deep");
		const fm = makeFrontmatter({ slug: "deep-plan" });
		savePlan("deep-plan", fm, "content", nestedBase);

		assert.ok(existsSync(join(nestedBase, "deep-plan", "plan.md")));
	});

	it("returns null for non-existent plan", () => {
		const result = loadPlan("nonexistent", tempDir);
		assert.equal(result, null);
	});

	it("returns null for malformed plan file", () => {
		const planDir = join(tempDir, "bad-plan");
		mkdirSync(planDir, { recursive: true });
		writeFileSync(join(planDir, "plan.md"), "no frontmatter here", "utf-8");

		const result = loadPlan("bad-plan", tempDir);
		assert.equal(result, null);
	});
});

describe("listPlans", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "plan-list-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns empty array when no plans exist", () => {
		const plans = listPlans(tempDir);
		assert.deepEqual(plans, []);
	});

	it("returns empty array when directory doesn't exist", () => {
		const plans = listPlans(join(tempDir, "nonexistent"));
		assert.deepEqual(plans, []);
	});

	it("returns plans sorted by updated date (most recent first)", () => {
		savePlan("older", makeFrontmatter({ slug: "older", updated: "2026-01-01T00:00:00Z" }), "old", tempDir);
		savePlan("newer", makeFrontmatter({ slug: "newer", updated: "2026-02-01T00:00:00Z" }), "new", tempDir);
		savePlan("middle", makeFrontmatter({ slug: "middle", updated: "2026-01-15T00:00:00Z" }), "mid", tempDir);

		const plans = listPlans(tempDir);
		assert.equal(plans.length, 3);
		assert.equal(plans[0].slug, "newer");
		assert.equal(plans[1].slug, "middle");
		assert.equal(plans[2].slug, "older");
	});

	it("skips directories without plan.md", () => {
		savePlan("valid", makeFrontmatter({ slug: "valid" }), "content", tempDir);
		mkdirSync(join(tempDir, "empty-dir"), { recursive: true });

		const plans = listPlans(tempDir);
		assert.equal(plans.length, 1);
		assert.equal(plans[0].slug, "valid");
	});

	it("skips non-directory entries", () => {
		savePlan("valid", makeFrontmatter({ slug: "valid" }), "content", tempDir);
		writeFileSync(join(tempDir, "README.md"), "# Index", "utf-8");

		const plans = listPlans(tempDir);
		assert.equal(plans.length, 1);
	});
});

describe("updatePlanFrontmatter", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "plan-update-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("merges partial updates without losing other fields", () => {
		const fm = makeFrontmatter();
		savePlan("test-plan", fm, "content", tempDir);

		const updated = updatePlanFrontmatter("test-plan", { status: "planned" }, tempDir);
		assert.ok(updated);
		assert.equal(updated.status, "planned");
		assert.equal(updated.title, "Test Plan"); // preserved
		assert.equal(updated.steps, 3); // preserved
		assert.equal(updated.has_review, false); // preserved
	});

	it("sets updated timestamp", () => {
		const fm = makeFrontmatter({ updated: "2026-01-01T00:00:00Z" });
		savePlan("test-plan", fm, "content", tempDir);

		const before = new Date().toISOString();
		const updated = updatePlanFrontmatter("test-plan", { status: "planned" }, tempDir);
		assert.ok(updated);
		assert.ok(updated.updated >= before);
	});

	it("returns null for non-existent plan", () => {
		const result = updatePlanFrontmatter("nonexistent", { status: "planned" }, tempDir);
		assert.equal(result, null);
	});

	it("preserves plan content after update", () => {
		const fm = makeFrontmatter();
		const content = "# My Plan\n\nDetailed content here.";
		savePlan("test-plan", fm, content, tempDir);

		updatePlanFrontmatter("test-plan", { status: "planned" }, tempDir);

		const loaded = loadPlan("test-plan", tempDir);
		assert.ok(loaded);
		assert.equal(loaded.content, content);
	});
});

describe("savePlanArtifact + loadPlanArtifact", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "plan-artifact-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("round-trips artifact content", () => {
		savePlanArtifact("my-plan", "review.md", "# Review\n\nLooks good.", tempDir);

		const content = loadPlanArtifact("my-plan", "review.md", tempDir);
		assert.equal(content, "# Review\n\nLooks good.");
	});

	it("creates plan directory if it doesn't exist", () => {
		savePlanArtifact("new-plan", "pre-mortem.md", "# Pre-mortem", tempDir);
		assert.ok(existsSync(join(tempDir, "new-plan", "pre-mortem.md")));
	});

	it("returns null for non-existent artifact", () => {
		const result = loadPlanArtifact("nonexistent", "review.md", tempDir);
		assert.equal(result, null);
	});
});

describe("deletePlan", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "plan-delete-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("removes plan directory", () => {
		savePlan("doomed", makeFrontmatter({ slug: "doomed" }), "bye", tempDir);
		assert.ok(existsSync(join(tempDir, "doomed")));

		deletePlan("doomed", tempDir);
		assert.ok(!existsSync(join(tempDir, "doomed")));
	});

	it("handles non-existent plan gracefully", () => {
		// Should not throw
		deletePlan("nonexistent", tempDir);
	});

	it("removes directory with multiple artifacts", () => {
		savePlan("multi", makeFrontmatter({ slug: "multi" }), "plan", tempDir);
		savePlanArtifact("multi", "review.md", "review", tempDir);
		savePlanArtifact("multi", "pre-mortem.md", "pre-mortem", tempDir);

		deletePlan("multi", tempDir);
		assert.ok(!existsSync(join(tempDir, "multi")));
	});
});

// ────────────────────────────────────────────────────────────
// migrateStatus
// ────────────────────────────────────────────────────────────

describe("migrateStatus", () => {
	it("passes through current statuses", () => {
		assert.equal(migrateStatus("idea"), "idea");
		assert.equal(migrateStatus("draft"), "draft");
		assert.equal(migrateStatus("planned"), "planned");
		assert.equal(migrateStatus("building"), "building");
		assert.equal(migrateStatus("complete"), "complete");
		assert.equal(migrateStatus("abandoned"), "abandoned");
	});

	it("migrates ready to planned", () => {
		assert.equal(migrateStatus("ready"), "planned");
	});

	it("migrates legacy statuses", () => {
		assert.equal(migrateStatus("reviewed"), "planned");
		assert.equal(migrateStatus("approved"), "planned");
		assert.equal(migrateStatus("in-progress"), "building");
		assert.equal(migrateStatus("completed"), "complete");
		assert.equal(migrateStatus("blocked"), "draft");
		assert.equal(migrateStatus("on-hold"), "draft");
	});

	it("defaults to draft for unknown statuses", () => {
		assert.equal(migrateStatus("banana"), "draft");
		assert.equal(migrateStatus(""), "draft");
	});
});

// ────────────────────────────────────────────────────────────
// Tags parsing
// ────────────────────────────────────────────────────────────

describe("tags parsing", () => {
	it("serializes and parses multiple tags", () => {
		const fm = makeFrontmatter({ tags: ["feature", "integration"] });
		const serialized = serializeFrontmatter(fm);
		const parsed = parseFrontmatter(serialized);
		assert.deepEqual(parsed.tags, ["feature", "integration"]);
	});

	it("serializes and parses empty tags", () => {
		const fm = makeFrontmatter({ tags: [] });
		const serialized = serializeFrontmatter(fm);
		const parsed = parseFrontmatter(serialized);
		assert.deepEqual(parsed.tags, []);
	});

	it("serializes and parses single tag", () => {
		const fm = makeFrontmatter({ tags: ["feature"] });
		const serialized = serializeFrontmatter(fm);
		const parsed = parseFrontmatter(serialized);
		assert.deepEqual(parsed.tags, ["feature"]);
	});

	it("defaults tags to empty array when missing", () => {
		const raw = "---\ntitle: Test\nslug: test\nstatus: draft\n---";
		const parsed = parseFrontmatter(raw);
		assert.deepEqual(parsed.tags, []);
	});

	it("parses tags with extra spaces", () => {
		const raw = "---\ntags: [ feature , integration , refactor ]\n---";
		const parsed = parseFrontmatter(raw);
		assert.deepEqual(parsed.tags, ["feature", "integration", "refactor"]);
	});
});

// ────────────────────────────────────────────────────────────
// parseFrontmatterFromFile
// ────────────────────────────────────────────────────────────

describe("parseFrontmatterFromFile", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "parse-fm-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("parses file with valid frontmatter", () => {
		const fm = makeFrontmatter({ title: "My Item", slug: "my-item" });
		const content = "# My Item\n\nSome content.";
		const fileContent = `${serializeFrontmatter(fm)}\n\n${content}`;
		const filePath = join(tempDir, "my-item.md");
		writeFileSync(filePath, fileContent, "utf-8");

		const result = parseFrontmatterFromFile(filePath);
		assert.equal(result.frontmatter.title, "My Item");
		assert.equal(result.frontmatter.slug, "my-item");
		assert.equal(result.content, content);
	});

	it("returns defaults for file without frontmatter", () => {
		const filePath = join(tempDir, "raw-idea.md");
		writeFileSync(filePath, "# Raw Idea\n\nJust some text.", "utf-8");

		const result = parseFrontmatterFromFile(filePath);
		assert.equal(result.frontmatter.title, "Raw Idea");
		assert.equal(result.frontmatter.slug, "raw-idea");
		assert.equal(result.frontmatter.status, "idea");
		assert.equal(result.frontmatter.size, "unknown");
		assert.deepEqual(result.frontmatter.tags, []);
		assert.equal(result.content, "# Raw Idea\n\nJust some text.");
	});
});

// ────────────────────────────────────────────────────────────
// Deprecated backlog functions (verify they throw)
// ────────────────────────────────────────────────────────────

describe("deprecated backlog functions", () => {
	it("listBacklog throws deprecation error", () => {
		assert.throws(() => listBacklog(), /Deprecated: backlog functions removed/);
	});

	it("createBacklogItem throws deprecation error", () => {
		assert.throws(() => createBacklogItem("test"), /Deprecated: backlog functions removed/);
	});

	it("promoteBacklogItem throws deprecation error", () => {
		assert.throws(() => promoteBacklogItem("test"), /Deprecated: backlog functions removed/);
	});

	it("shelveToBacklog throws deprecation error", () => {
		assert.throws(() => shelveToBacklog("test"), /Deprecated: backlog functions removed/);
	});
});

// ────────────────────────────────────────────────────────────
// listArchive
// ────────────────────────────────────────────────────────────

describe("listArchive", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "archive-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns empty for nonexistent dir", () => {
		assert.deepEqual(listArchive(join(tempDir, "nonexistent")), []);
	});

	it("lists archived folders", () => {
		const archDir = join(tempDir, "done-plan");
		mkdirSync(archDir, { recursive: true });
		const fm = serializeFrontmatter(makeFrontmatter({ title: "Done Plan", slug: "done-plan", status: "complete" }));
		writeFileSync(join(archDir, "plan.md"), `${fm}\n\n# Done`, "utf-8");

		const items = listArchive(tempDir);
		assert.equal(items.length, 1);
		assert.equal(items[0].slug, "done-plan");
	});
});

// ────────────────────────────────────────────────────────────
// moveItem
// ────────────────────────────────────────────────────────────

describe("moveItem", () => {
	let tempDir: string;
	let fromDir: string;
	let toDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "move-test-"));
		fromDir = join(tempDir, "from");
		toDir = join(tempDir, "to");
		mkdirSync(fromDir, { recursive: true });
		mkdirSync(toDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("moves a flat file", () => {
		writeFileSync(join(fromDir, "item.md"), "content", "utf-8");
		moveItem("item", fromDir, toDir);
		assert.ok(!existsSync(join(fromDir, "item.md")));
		assert.ok(existsSync(join(toDir, "item.md")));
	});

	it("moves a folder with all contents", () => {
		const srcDir = join(fromDir, "plan-item");
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(join(srcDir, "plan.md"), "plan content", "utf-8");
		writeFileSync(join(srcDir, "prd.md"), "prd content", "utf-8");

		moveItem("plan-item", fromDir, toDir);

		assert.ok(!existsSync(srcDir));
		assert.ok(existsSync(join(toDir, "plan-item", "plan.md")));
		assert.ok(existsSync(join(toDir, "plan-item", "prd.md")));
	});

	it("throws for non-existent item", () => {
		assert.throws(() => moveItem("ghost", fromDir, toDir), /not found/i);
	});
});

// ────────────────────────────────────────────────────────────
// migrateBacklogToPlans
// ────────────────────────────────────────────────────────────

describe("migrateBacklogToPlans", () => {
	let tempDir: string;
	let backlogDir: string;
	let plansDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "migrate-test-"));
		backlogDir = join(tempDir, "backlog");
		plansDir = join(tempDir, "plans");
		mkdirSync(backlogDir, { recursive: true });
		mkdirSync(plansDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns empty result for nonexistent backlog dir", () => {
		const result = migrateBacklogToPlans(join(tempDir, "nonexistent"), plansDir);
		assert.deepEqual(result.moved, []);
		assert.deepEqual(result.collisions, []);
		assert.deepEqual(result.skipped, []);
	});

	it("returns empty result for empty backlog dir", () => {
		const result = migrateBacklogToPlans(backlogDir, plansDir);
		assert.deepEqual(result.moved, []);
		assert.deepEqual(result.collisions, []);
		assert.deepEqual(result.skipped, []);
	});

	it("migrates flat .md file to plan folder", () => {
		const fm = serializeFrontmatter(makeFrontmatter({ title: "My Idea", slug: "my-idea", status: "idea" }));
		writeFileSync(join(backlogDir, "my-idea.md"), `${fm}\n\n# My Idea\n\nContent here.`, "utf-8");

		const result = migrateBacklogToPlans(backlogDir, plansDir);

		assert.deepEqual(result.moved, ["my-idea"]);
		assert.deepEqual(result.collisions, []);
		assert.deepEqual(result.skipped, []);

		const planFile = join(plansDir, "my-idea", "plan.md");
		assert.ok(existsSync(planFile));
		const loaded = parseFrontmatterFromFile(planFile);
		assert.equal(loaded.frontmatter.title, "My Idea");
		assert.equal(loaded.frontmatter.status, "idea");
	});

	it("migrates flat file without frontmatter and sets status to idea", () => {
		writeFileSync(join(backlogDir, "raw-thought.md"), "# Raw Thought\n\nJust text.", "utf-8");

		const result = migrateBacklogToPlans(backlogDir, plansDir);

		assert.deepEqual(result.moved, ["raw-thought"]);
		const planFile = join(plansDir, "raw-thought", "plan.md");
		assert.ok(existsSync(planFile));
		const loaded = parseFrontmatterFromFile(planFile);
		assert.equal(loaded.frontmatter.status, "idea");
	});

	it("migrates folder with plan.md as-is", () => {
		const srcDir = join(backlogDir, "folder-item");
		mkdirSync(srcDir, { recursive: true });
		const fm = serializeFrontmatter(makeFrontmatter({ title: "Folder Item", slug: "folder-item", status: "draft" }));
		writeFileSync(join(srcDir, "plan.md"), `${fm}\n\n# Folder Item`, "utf-8");
		writeFileSync(join(srcDir, "notes.md"), "Extra notes", "utf-8");

		const result = migrateBacklogToPlans(backlogDir, plansDir);

		assert.deepEqual(result.moved, ["folder-item"]);
		assert.ok(existsSync(join(plansDir, "folder-item", "plan.md")));
		assert.ok(existsSync(join(plansDir, "folder-item", "notes.md")));
		const loaded = parseFrontmatterFromFile(join(plansDir, "folder-item", "plan.md"));
		assert.equal(loaded.frontmatter.status, "draft");
	});

	it("renames inner file to plan.md when folder has non-plan.md file", () => {
		const srcDir = join(backlogDir, "oddly-named");
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(join(srcDir, "my-idea.md"), "# My Idea\n\nContent.", "utf-8");

		const result = migrateBacklogToPlans(backlogDir, plansDir);

		assert.deepEqual(result.moved, ["oddly-named"]);
		const planFile = join(plansDir, "oddly-named", "plan.md");
		assert.ok(existsSync(planFile));
		// Original name should not exist
		assert.ok(!existsSync(join(plansDir, "oddly-named", "my-idea.md")));
	});

	it("handles slug collision by suffixing with -idea", () => {
		// Create existing plan
		savePlan("my-idea", makeFrontmatter({ title: "Existing Plan", slug: "my-idea" }), "Existing content.", plansDir);

		// Create backlog item with same slug
		const fm = serializeFrontmatter(makeFrontmatter({ title: "My Idea", slug: "my-idea", status: "idea" }));
		writeFileSync(join(backlogDir, "my-idea.md"), `${fm}\n\n# My Idea`, "utf-8");

		const result = migrateBacklogToPlans(backlogDir, plansDir);

		assert.deepEqual(result.moved, ["my-idea-idea"]);
		assert.equal(result.collisions.length, 1);
		assert.equal(result.collisions[0].slug, "my-idea");
		assert.ok(result.collisions[0].resolution.includes("my-idea-idea"));

		// Both should exist
		assert.ok(existsSync(join(plansDir, "my-idea", "plan.md")));
		assert.ok(existsSync(join(plansDir, "my-idea-idea", "plan.md")));
	});

	it("skips non-.md files", () => {
		writeFileSync(join(backlogDir, "readme.txt"), "not a plan", "utf-8");

		const result = migrateBacklogToPlans(backlogDir, plansDir);

		assert.deepEqual(result.moved, []);
		assert.deepEqual(result.skipped, ["readme.txt"]);
	});

	it("creates plans dir if it does not exist", () => {
		const newPlansDir = join(tempDir, "new-plans");
		writeFileSync(join(backlogDir, "test.md"), "# Test", "utf-8");

		const result = migrateBacklogToPlans(backlogDir, newPlansDir);

		assert.deepEqual(result.moved, ["test"]);
		assert.ok(existsSync(join(newPlansDir, "test", "plan.md")));
	});
});

// ────────────────────────────────────────────────────────────
// archiveItem
// ────────────────────────────────────────────────────────────

describe("archiveItem", () => {
	let tempDir: string;
	let archiveDir: string;
	let plansDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "archive-item-test-"));
		archiveDir = join(tempDir, "archive");
		plansDir = join(tempDir, "plans");
		mkdirSync(archiveDir, { recursive: true });
		mkdirSync(plansDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("archives plan as complete with completed date", () => {
		const srcDir = join(plansDir, "done-plan");
		mkdirSync(srcDir, { recursive: true });
		const fm = serializeFrontmatter(makeFrontmatter({ title: "Done Plan", slug: "done-plan", status: "building" }));
		writeFileSync(join(srcDir, "plan.md"), `${fm}\n\n# Done`, "utf-8");

		archiveItem("done-plan", "complete", archiveDir);

		assert.ok(!existsSync(srcDir));
		const planFile = join(archiveDir, "done-plan", "plan.md");
		assert.ok(existsSync(planFile));
		const result = parseFrontmatterFromFile(planFile);
		assert.equal(result.frontmatter.status, "complete");
		assert.ok(result.frontmatter.completed !== null);
	});

	it("archives plan as abandoned", () => {
		const srcDir = join(plansDir, "abandoned-plan");
		mkdirSync(srcDir, { recursive: true });
		const fm = serializeFrontmatter(makeFrontmatter({ title: "Abandoned", slug: "abandoned-plan" }));
		writeFileSync(join(srcDir, "plan.md"), `${fm}\n\n# Abandoned`, "utf-8");

		archiveItem("abandoned-plan", "abandoned", archiveDir);

		const result = parseFrontmatterFromFile(join(archiveDir, "abandoned-plan", "plan.md"));
		assert.equal(result.frontmatter.status, "abandoned");
	});
});
