import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferPhaseFromPlan } from "./commands.js";

describe("inferPhaseFromPlan", () => {
	it("returns done for completed status", () => {
		assert.equal(
			inferPhaseFromPlan("completed", { has_prd: true, has_pre_mortem: true, has_review: true }),
			"done",
		);
	});

	it("returns build for approved/in-progress", () => {
		assert.equal(
			inferPhaseFromPlan("approved", { has_prd: true, has_pre_mortem: true, has_review: true }),
			"build",
		);
		assert.equal(
			inferPhaseFromPlan("in-progress", { has_prd: true, has_pre_mortem: true, has_review: true }),
			"build",
		);
	});

	it("returns review when review gate completed", () => {
		assert.equal(
			inferPhaseFromPlan("planned", { has_prd: true, has_pre_mortem: true, has_review: true }),
			"review",
		);
	});

	it("returns pre-mortem when only pre-mortem is completed", () => {
		assert.equal(
			inferPhaseFromPlan("planned", { has_prd: true, has_pre_mortem: true, has_review: false }),
			"pre-mortem",
		);
	});

	it("returns prd when only prd gate completed", () => {
		assert.equal(
			inferPhaseFromPlan("planned", { has_prd: true, has_pre_mortem: false, has_review: false }),
			"prd",
		);
	});

	it("returns plan when no gate is completed", () => {
		assert.equal(
			inferPhaseFromPlan("draft", { has_prd: false, has_pre_mortem: false, has_review: false }),
			"plan",
		);
	});
});
