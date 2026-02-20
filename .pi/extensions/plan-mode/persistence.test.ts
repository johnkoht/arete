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
	type PlanFrontmatter,
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
