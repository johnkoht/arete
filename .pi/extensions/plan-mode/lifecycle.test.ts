import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	canTransition,
	getGateRequirements,
	getAvailableTransitions,
	getMissingGates,
	isReadyToApprove,
} from "./lifecycle.js";

describe("canTransition", () => {
	it("allows draft → planned", () => {
		assert.equal(canTransition("draft", "planned"), true);
	});

	it("allows planned → reviewed", () => {
		assert.equal(canTransition("planned", "reviewed"), true);
	});

	it("allows planned → approved", () => {
		assert.equal(canTransition("planned", "approved"), true);
	});

	it("allows reviewed → approved", () => {
		assert.equal(canTransition("reviewed", "approved"), true);
	});

	it("allows approved → in-progress", () => {
		assert.equal(canTransition("approved", "in-progress"), true);
	});

	it("allows in-progress → completed", () => {
		assert.equal(canTransition("in-progress", "completed"), true);
	});

	it("rejects draft → completed (invalid skip)", () => {
		assert.equal(canTransition("draft", "completed"), false);
	});

	it("rejects draft → approved (invalid skip)", () => {
		assert.equal(canTransition("draft", "approved"), false);
	});

	it("rejects completed → draft (no backward)", () => {
		assert.equal(canTransition("completed", "draft"), false);
	});

	it("allows any → blocked", () => {
		assert.equal(canTransition("draft", "blocked"), true);
		assert.equal(canTransition("planned", "blocked"), true);
		assert.equal(canTransition("reviewed", "blocked"), true);
		assert.equal(canTransition("approved", "blocked"), true);
		assert.equal(canTransition("in-progress", "blocked"), true);
	});

	it("allows any → on-hold", () => {
		assert.equal(canTransition("draft", "on-hold"), true);
		assert.equal(canTransition("planned", "on-hold"), true);
		assert.equal(canTransition("in-progress", "on-hold"), true);
	});

	it("allows blocked → any previous status (resume)", () => {
		assert.equal(canTransition("blocked", "draft"), true);
		assert.equal(canTransition("blocked", "planned"), true);
		assert.equal(canTransition("blocked", "reviewed"), true);
		assert.equal(canTransition("blocked", "approved"), true);
		assert.equal(canTransition("blocked", "in-progress"), true);
		assert.equal(canTransition("blocked", "completed"), true);
	});

	it("allows on-hold → any previous status (resume)", () => {
		assert.equal(canTransition("on-hold", "draft"), true);
		assert.equal(canTransition("on-hold", "planned"), true);
		assert.equal(canTransition("on-hold", "in-progress"), true);
	});
});

describe("getGateRequirements", () => {
	it("tiny: all optional", () => {
		const gates = getGateRequirements("tiny");
		assert.equal(gates.length, 3);
		assert.ok(gates.every((g) => !g.required && !g.recommended));
	});

	it("small: all optional", () => {
		const gates = getGateRequirements("small");
		assert.equal(gates.length, 3);
		assert.ok(gates.every((g) => !g.required && !g.recommended));
	});

	it("medium: pre-mortem recommended, others optional", () => {
		const gates = getGateRequirements("medium");
		const preMortem = gates.find((g) => g.gate === "pre-mortem");
		const review = gates.find((g) => g.gate === "review");
		const prd = gates.find((g) => g.gate === "prd");

		assert.ok(preMortem);
		assert.equal(preMortem.recommended, true);
		assert.equal(preMortem.required, false);

		assert.ok(review);
		assert.equal(review.required, false);
		assert.equal(review.recommended, false);

		assert.ok(prd);
		assert.equal(prd.required, false);
		assert.equal(prd.recommended, false);
	});

	it("large: pre-mortem + PRD mandatory, review recommended", () => {
		const gates = getGateRequirements("large");
		const preMortem = gates.find((g) => g.gate === "pre-mortem");
		const prd = gates.find((g) => g.gate === "prd");
		const review = gates.find((g) => g.gate === "review");

		assert.ok(preMortem);
		assert.equal(preMortem.required, true);

		assert.ok(prd);
		assert.equal(prd.required, true);

		assert.ok(review);
		assert.equal(review.recommended, true);
		assert.equal(review.required, false);
	});
});

describe("isReadyToApprove", () => {
	it("tiny: always ready (no mandatory gates)", () => {
		const result = isReadyToApprove("tiny", { has_review: false, has_pre_mortem: false, has_prd: false });
		assert.equal(result.ready, true);
		assert.equal(result.missing.length, 0);
	});

	it("small: always ready (no mandatory gates)", () => {
		const result = isReadyToApprove("small", { has_review: false, has_pre_mortem: false, has_prd: false });
		assert.equal(result.ready, true);
	});

	it("medium: always ready (pre-mortem recommended, not required)", () => {
		const result = isReadyToApprove("medium", { has_review: false, has_pre_mortem: false, has_prd: false });
		assert.equal(result.ready, true);
	});

	it("large: not ready without pre-mortem", () => {
		const result = isReadyToApprove("large", { has_review: false, has_pre_mortem: false, has_prd: true });
		assert.equal(result.ready, false);
		assert.equal(result.missing.length, 1);
		assert.equal(result.missing[0].gate, "pre-mortem");
	});

	it("large: not ready without PRD", () => {
		const result = isReadyToApprove("large", { has_review: false, has_pre_mortem: true, has_prd: false });
		assert.equal(result.ready, false);
		assert.equal(result.missing.length, 1);
		assert.equal(result.missing[0].gate, "prd");
	});

	it("large: not ready without both pre-mortem and PRD", () => {
		const result = isReadyToApprove("large", { has_review: false, has_pre_mortem: false, has_prd: false });
		assert.equal(result.ready, false);
		assert.equal(result.missing.length, 2);
	});

	it("large: ready with pre-mortem + PRD (review is recommended, not required)", () => {
		const result = isReadyToApprove("large", { has_review: false, has_pre_mortem: true, has_prd: true });
		assert.equal(result.ready, true);
		assert.equal(result.missing.length, 0);
	});

	it("large: ready with all gates", () => {
		const result = isReadyToApprove("large", { has_review: true, has_pre_mortem: true, has_prd: true });
		assert.equal(result.ready, true);
	});
});

describe("getMissingGates", () => {
	it("returns all gates when none completed", () => {
		const missing = getMissingGates("large", { has_review: false, has_pre_mortem: false, has_prd: false });
		assert.equal(missing.length, 3);
	});

	it("returns empty when all completed", () => {
		const missing = getMissingGates("large", { has_review: true, has_pre_mortem: true, has_prd: true });
		assert.equal(missing.length, 0);
	});

	it("returns only uncompleted gates", () => {
		const missing = getMissingGates("large", { has_review: true, has_pre_mortem: false, has_prd: true });
		assert.equal(missing.length, 1);
		assert.equal(missing[0].gate, "pre-mortem");
	});

	it("medium: missing pre-mortem is recommended", () => {
		const missing = getMissingGates("medium", { has_review: false, has_pre_mortem: false, has_prd: false });
		const preMortem = missing.find((g) => g.gate === "pre-mortem");
		assert.ok(preMortem);
		assert.equal(preMortem.recommended, true);
		assert.equal(preMortem.required, false);
	});

	it("large: missing pre-mortem is required", () => {
		const missing = getMissingGates("large", { has_review: true, has_pre_mortem: false, has_prd: true });
		assert.equal(missing.length, 1);
		assert.equal(missing[0].gate, "pre-mortem");
		assert.equal(missing[0].required, true);
	});
});

describe("getAvailableTransitions", () => {
	it("draft can go to planned, blocked, on-hold", () => {
		const transitions = getAvailableTransitions("draft", "small", {
			has_review: false,
			has_pre_mortem: false,
			has_prd: false,
		});
		assert.ok(transitions.includes("planned"));
		assert.ok(transitions.includes("blocked"));
		assert.ok(transitions.includes("on-hold"));
		assert.ok(!transitions.includes("completed"));
	});

	it("planned can go to reviewed, approved, blocked, on-hold", () => {
		const transitions = getAvailableTransitions("planned", "small", {
			has_review: false,
			has_pre_mortem: false,
			has_prd: false,
		});
		assert.ok(transitions.includes("reviewed"));
		assert.ok(transitions.includes("approved"));
		assert.ok(transitions.includes("blocked"));
		assert.ok(transitions.includes("on-hold"));
	});

	it("approved can go to in-progress, blocked, on-hold", () => {
		const transitions = getAvailableTransitions("approved", "small", {
			has_review: false,
			has_pre_mortem: false,
			has_prd: false,
		});
		assert.ok(transitions.includes("in-progress"));
		assert.ok(transitions.includes("blocked"));
	});
});
