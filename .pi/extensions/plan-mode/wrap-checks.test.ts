import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	checkMemoryEntry,
	checkMemoryIndex,
	checkPlanStatus,
	getChangedDirectories,
	checkCapabilityCatalog,
} from "./wrap-checks.js";
import { savePlan, type PlanFrontmatter } from "./persistence.js";

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

describe("checkMemoryEntry", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wrap-checks-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns false when entries dir does not exist", () => {
		const result = checkMemoryEntry("my-plan", tmpDir);
		assert.equal(result, false);
	});

	it("returns false when no matching entry exists", () => {
		const entriesDir = join(tmpDir, "memory", "entries");
		mkdirSync(entriesDir, { recursive: true });
		writeFileSync(join(entriesDir, "2026-03-08_other-plan.md"), "# Other");

		const result = checkMemoryEntry("my-plan", tmpDir);
		assert.equal(result, false);
	});

	it("returns true when matching entry exists (exact slug)", () => {
		const entriesDir = join(tmpDir, "memory", "entries");
		mkdirSync(entriesDir, { recursive: true });
		writeFileSync(join(entriesDir, "2026-03-08_my-plan.md"), "# My Plan");

		const result = checkMemoryEntry("my-plan", tmpDir);
		assert.equal(result, true);
	});

	it("returns true when matching entry exists (slug with suffix)", () => {
		const entriesDir = join(tmpDir, "memory", "entries");
		mkdirSync(entriesDir, { recursive: true });
		writeFileSync(join(entriesDir, "2026-03-08_my-plan-learnings.md"), "# My Plan Learnings");

		const result = checkMemoryEntry("my-plan", tmpDir);
		assert.equal(result, true);
	});

	it("is case-insensitive", () => {
		const entriesDir = join(tmpDir, "memory", "entries");
		mkdirSync(entriesDir, { recursive: true });
		writeFileSync(join(entriesDir, "2026-03-08_My-Plan.md"), "# My Plan");

		const result = checkMemoryEntry("my-plan", tmpDir);
		assert.equal(result, true);
	});

	it("handles regex special characters in slug", () => {
		const entriesDir = join(tmpDir, "memory", "entries");
		mkdirSync(entriesDir, { recursive: true });
		writeFileSync(join(entriesDir, "2026-03-08_plan.with.dots.md"), "# Plan");

		const result = checkMemoryEntry("plan.with.dots", tmpDir);
		assert.equal(result, true);
	});
});

describe("checkMemoryIndex", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wrap-checks-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns false when MEMORY.md does not exist", () => {
		const result = checkMemoryIndex("my-plan", tmpDir);
		assert.equal(result, false);
	});

	it("returns false when slug not in index", () => {
		const memoryDir = join(tmpDir, "memory");
		mkdirSync(memoryDir, { recursive: true });
		writeFileSync(
			join(memoryDir, "MEMORY.md"),
			"# Memory Index\n\n- 2026-03-08 [Other](entries/2026-03-08_other-plan.md)",
		);

		const result = checkMemoryIndex("my-plan", tmpDir);
		assert.equal(result, false);
	});

	it("returns true when slug is in index", () => {
		const memoryDir = join(tmpDir, "memory");
		mkdirSync(memoryDir, { recursive: true });
		writeFileSync(
			join(memoryDir, "MEMORY.md"),
			"# Memory Index\n\n- 2026-03-08 [My Plan](entries/2026-03-08_my-plan.md)",
		);

		const result = checkMemoryIndex("my-plan", tmpDir);
		assert.equal(result, true);
	});

	it("is case-insensitive", () => {
		const memoryDir = join(tmpDir, "memory");
		mkdirSync(memoryDir, { recursive: true });
		writeFileSync(
			join(memoryDir, "MEMORY.md"),
			"# Memory Index\n\n- 2026-03-08 [MY-PLAN](entries/2026-03-08_MY-PLAN.md)",
		);

		const result = checkMemoryIndex("my-plan", tmpDir);
		assert.equal(result, true);
	});
});

describe("checkPlanStatus", () => {
	let tmpDir: string;
	let plansDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wrap-checks-test-"));
		plansDir = join(tmpDir, "plans");
		mkdirSync(plansDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null when plan does not exist", () => {
		const result = checkPlanStatus("nonexistent", plansDir);
		assert.equal(result, null);
	});

	it("returns status from plan frontmatter", () => {
		const fm = makeFrontmatter({ slug: "my-plan", status: "building" });
		savePlan("my-plan", fm, "# Content", plansDir);

		const result = checkPlanStatus("my-plan", plansDir);
		assert.equal(result, "building");
	});

	it("returns different statuses correctly", () => {
		const statuses = ["draft", "planned", "building", "complete", "abandoned"] as const;

		for (const status of statuses) {
			const fm = makeFrontmatter({ slug: `plan-${status}`, status });
			savePlan(`plan-${status}`, fm, "# Content", plansDir);

			const result = checkPlanStatus(`plan-${status}`, plansDir);
			assert.equal(result, status);
		}
	});
});

describe("getChangedDirectories", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wrap-checks-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null when not in a git repository", () => {
		// tmpDir is not a git repo
		const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const result = getChangedDirectories(since, tmpDir);
		assert.equal(result, null);
	});

	it("returns changed directories for recent commits in current repo", () => {
		const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
		const result = getChangedDirectories(since, process.cwd());
		assert.ok(result !== null, "Should not return null in a valid git repo");
		assert.ok(Array.isArray(result), "Should return an array");
	});
});

describe("checkCapabilityCatalog", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "wrap-checks-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null when catalog does not exist", () => {
		const result = checkCapabilityCatalog(tmpDir);
		assert.equal(result, null);
	});

	it("returns null when catalog is malformed JSON", () => {
		const catalogDir = join(tmpDir, "dev", "catalog");
		mkdirSync(catalogDir, { recursive: true });
		writeFileSync(join(catalogDir, "capabilities.json"), "not valid json");

		const result = checkCapabilityCatalog(tmpDir);
		assert.equal(result, null);
	});

	it("returns null when lastUpdated field is missing", () => {
		const catalogDir = join(tmpDir, "dev", "catalog");
		mkdirSync(catalogDir, { recursive: true });
		writeFileSync(join(catalogDir, "capabilities.json"), JSON.stringify({ version: 1 }));

		const result = checkCapabilityCatalog(tmpDir);
		assert.equal(result, null);
	});

	it("returns null when lastUpdated is invalid date", () => {
		const catalogDir = join(tmpDir, "dev", "catalog");
		mkdirSync(catalogDir, { recursive: true });
		writeFileSync(
			join(catalogDir, "capabilities.json"),
			JSON.stringify({ lastUpdated: "not-a-date" }),
		);

		const result = checkCapabilityCatalog(tmpDir);
		assert.equal(result, null);
	});

	it("returns Date when catalog has valid lastUpdated (YYYY-MM-DD format)", () => {
		const catalogDir = join(tmpDir, "dev", "catalog");
		mkdirSync(catalogDir, { recursive: true });
		writeFileSync(
			join(catalogDir, "capabilities.json"),
			JSON.stringify({ version: 1, lastUpdated: "2026-03-08" }),
		);

		const result = checkCapabilityCatalog(tmpDir);
		assert.ok(result instanceof Date);
		assert.equal(result.getUTCFullYear(), 2026);
		assert.equal(result.getUTCMonth(), 2); // March is 2 (0-indexed)
		assert.equal(result.getUTCDate(), 8);
	});

	it("returns Date when catalog has valid lastUpdated (ISO format)", () => {
		const catalogDir = join(tmpDir, "dev", "catalog");
		mkdirSync(catalogDir, { recursive: true });
		writeFileSync(
			join(catalogDir, "capabilities.json"),
			JSON.stringify({ version: 1, lastUpdated: "2026-03-08T10:30:00.000Z" }),
		);

		const result = checkCapabilityCatalog(tmpDir);
		assert.ok(result instanceof Date);
		assert.equal(result.getUTCFullYear(), 2026);
	});
});
