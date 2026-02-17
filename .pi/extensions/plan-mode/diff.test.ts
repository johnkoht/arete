import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getChangesSince } from "./commands.js";

describe("getChangesSince", () => {
	it("returns a PlanDiff with files array and since date", () => {
		const result = getChangesSince("2026-01-01T00:00:00Z");
		assert.ok(Array.isArray(result.files));
		assert.equal(result.since, "2026-01-01T00:00:00Z");
	});

	it("returns files for a recent date (within this repo)", () => {
		// Use a date far enough back that there should be commits
		const result = getChangesSince("2025-01-01T00:00:00Z");
		assert.ok(result.files.length > 0, "Expected at least some files changed since 2025-01-01");
	});

	it("returns empty for a future date", () => {
		const result = getChangesSince("2099-01-01T00:00:00Z");
		assert.equal(result.files.length, 0);
	});

	it("deduplicates file names", () => {
		const result = getChangesSince("2025-01-01T00:00:00Z");
		const unique = new Set(result.files);
		assert.equal(result.files.length, unique.size, "Files should be deduplicated");
	});

	it("files are non-empty strings", () => {
		const result = getChangesSince("2025-01-01T00:00:00Z");
		for (const f of result.files) {
			assert.ok(f.length > 0, "File path should not be empty");
			assert.ok(!f.includes("\n"), "File path should not contain newlines");
		}
	});

	it("handles gracefully when date is invalid", () => {
		// git log --since with an invalid date might error or return nothing
		const result = getChangesSince("not-a-date");
		// Should not throw — returns empty or some result
		assert.ok(Array.isArray(result.files));
	});
});
