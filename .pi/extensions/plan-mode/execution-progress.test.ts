import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	computePrdProgress,
	deriveActiveRole,
	formatCompactExecutionStatus,
	parsePrdFile,
	resolveExecutionProgress,
} from "./execution-progress.js";

describe("deriveActiveRole", () => {
	it("maps active command to deterministic role", () => {
		assert.equal(deriveActiveRole("plan"), "PM");
		assert.equal(deriveActiveRole("prd"), "PM");
		assert.equal(deriveActiveRole("build"), "EM");
		assert.equal(deriveActiveRole("pre-mortem"), "EM");
		assert.equal(deriveActiveRole("review"), "Reviewer");
		assert.equal(deriveActiveRole(null), "Agent");
	});
});

describe("parsePrdFile + computePrdProgress", () => {
	it("parses valid PRD JSON and picks in_progress as current first", () => {
		const parsed = parsePrdFile(
			JSON.stringify({
				userStories: [
					{ id: "a", title: "Task A", status: "complete" },
					{ id: "b", title: "Task B", status: "in_progress" },
					{ id: "c", title: "Task C", status: "pending" },
				],
			}),
		);
		assert.ok(parsed);
		const progress = computePrdProgress(parsed);
		assert.equal(progress.total, 3);
		assert.equal(progress.completed, 1);
		assert.equal(progress.currentTask?.id, "b");
		assert.equal(progress.currentTask?.status, "in_progress");
	});

	it("falls back to first pending when no in_progress task exists", () => {
		const parsed = parsePrdFile(
			JSON.stringify({
				userStories: [
					{ id: "a", title: "Task A", status: "complete" },
					{ id: "b", title: "Task B", status: "pending" },
				],
			}),
		);
		assert.ok(parsed);
		const progress = computePrdProgress(parsed);
		assert.equal(progress.currentTask?.id, "b");
	});

	it("returns null for malformed or incomplete JSON", () => {
		assert.equal(parsePrdFile("not json"), null);
		assert.equal(parsePrdFile(JSON.stringify({})), null);
		assert.equal(parsePrdFile(JSON.stringify({ userStories: [] })), null);
	});
});

describe("resolveExecutionProgress", () => {
	it("uses PRD source when available", () => {
		const progress = resolveExecutionProgress(
			{ hasPrd: true, todoItems: [] },
			() => ({
				source: "prd",
				total: 2,
				completed: 1,
				currentTask: { id: "2", title: "Second", status: "pending", index: 2 },
				tasks: [
					{ id: "1", title: "First", status: "complete", index: 1 },
					{ id: "2", title: "Second", status: "pending", index: 2 },
				],
			}),
		);
		assert.equal(progress.source, "prd");
		assert.equal(progress.total, 2);
	});

	it("falls back to todo source when PRD is unavailable", () => {
		const progress = resolveExecutionProgress(
			{
				hasPrd: true,
				todoItems: [
					{ step: 1, text: "One", completed: true },
					{ step: 2, text: "Two", completed: false },
				],
			},
			() => null,
		);
		assert.equal(progress.source, "todo");
		assert.equal(progress.completed, 1);
		assert.equal(progress.currentTask?.title, "Two");
	});
});

describe("formatCompactExecutionStatus", () => {
	it("formats compact line with truncation", () => {
		const line = formatCompactExecutionStatus(
			"EM",
			{
				source: "prd",
				total: 2,
				completed: 0,
				currentTask: {
					id: "1",
					title: "A very long title that should be truncated for compact mode",
					status: "in_progress",
					index: 1,
				},
				tasks: [],
			},
			24,
		);
		assert.match(line, /Role: EM/);
		assert.match(line, /PRD: 0\/2 complete/);
		assert.match(line, /Status: in_progress/);
		assert.match(line, /Current: #1 A very long title/);
		assert.match(line, /… · Status:/);
	});
});
