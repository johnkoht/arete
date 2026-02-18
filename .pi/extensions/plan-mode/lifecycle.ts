/**
 * Lifecycle state machine module.
 *
 * Defines valid status transitions, gate requirements by plan size,
 * and approval readiness checks.
 */

import type { PlanSize, PlanStatus } from "./persistence.js";

/** Gate requirement for a plan lifecycle transition */
export interface GateRequirement {
	gate: "review" | "pre-mortem" | "prd";
	required: boolean;
	recommended: boolean;
	label: string;
}

/** Gates completed on a plan */
export interface PlanGates {
	has_review: boolean;
	has_pre_mortem: boolean;
	has_prd: boolean;
}

/** Result from checking approval readiness */
export interface ApprovalReadiness {
	ready: boolean;
	missing: GateRequirement[];
}

/**
 * Valid status transitions.
 * Maps from-status → set of allowed to-statuses.
 *
 * Special: blocked and on-hold can be reached from any status.
 * Resume from blocked/on-hold goes to any status (restored from previous_status).
 */
const VALID_TRANSITIONS: Record<PlanStatus, Set<PlanStatus>> = {
	draft: new Set(["planned", "blocked", "on-hold"]),
	planned: new Set(["reviewed", "approved", "blocked", "on-hold"]),
	reviewed: new Set(["approved", "blocked", "on-hold"]),
	approved: new Set(["in-progress", "blocked", "on-hold"]),
	"in-progress": new Set(["completed", "blocked", "on-hold"]),
	completed: new Set(["blocked", "on-hold"]),
	// blocked and on-hold can transition to any status (via resume restoring previous_status)
	blocked: new Set<PlanStatus>(["draft", "planned", "reviewed", "approved", "in-progress", "completed", "on-hold"]),
	"on-hold": new Set<PlanStatus>(["draft", "planned", "reviewed", "approved", "in-progress", "completed", "blocked"]),
};

/**
 * Gate requirements by plan size.
 * Each size specifies which gates are required, recommended, or optional.
 */
const GATE_REQUIREMENTS: Record<PlanSize, { review: GateRequirement; preMortem: GateRequirement; prd: GateRequirement }> = {
	tiny: {
		review: { gate: "review", required: false, recommended: false, label: "Cross-model review (optional)" },
		preMortem: { gate: "pre-mortem", required: false, recommended: false, label: "Pre-mortem (optional)" },
		prd: { gate: "prd", required: false, recommended: false, label: "PRD (skip)" },
	},
	small: {
		review: { gate: "review", required: false, recommended: false, label: "Cross-model review (optional)" },
		preMortem: { gate: "pre-mortem", required: false, recommended: false, label: "Pre-mortem (optional)" },
		prd: { gate: "prd", required: false, recommended: false, label: "PRD (skip)" },
	},
	medium: {
		review: { gate: "review", required: false, recommended: false, label: "Cross-model review (optional)" },
		preMortem: { gate: "pre-mortem", required: false, recommended: true, label: "Pre-mortem (recommended)" },
		prd: { gate: "prd", required: false, recommended: false, label: "PRD (optional)" },
	},
	large: {
		review: { gate: "review", required: false, recommended: true, label: "Cross-model review (recommended)" },
		preMortem: { gate: "pre-mortem", required: true, recommended: false, label: "Pre-mortem (mandatory)" },
		prd: { gate: "prd", required: true, recommended: false, label: "PRD (mandatory)" },
	},
};

/**
 * Check if a status transition is valid.
 */
export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
	const allowed = VALID_TRANSITIONS[from];
	if (!allowed) return false;
	return allowed.has(to);
}

/**
 * Get all gate requirements for a plan of a given size.
 * Returns requirements regardless of current status.
 */
export function getGateRequirements(size: PlanSize): GateRequirement[] {
	const reqs = GATE_REQUIREMENTS[size];
	if (!reqs) return [];
	// Pipeline order: PRD → pre-mortem → review
	return [reqs.prd, reqs.preMortem, reqs.review];
}

/**
 * Get available next statuses given current status, size, and completed gates.
 */
export function getAvailableTransitions(
	status: PlanStatus,
	size: PlanSize,
	gates: PlanGates,
): PlanStatus[] {
	const allowed = VALID_TRANSITIONS[status];
	if (!allowed) return [];

	const transitions = [...allowed];

	// Filter out 'approved' if mandatory gates are missing
	if (transitions.includes("approved")) {
		const { ready } = isReadyToApprove(size, gates);
		if (!ready) {
			// Still include approved — caller can warn but allow override
		}
	}

	return transitions;
}

/**
 * Get gates that haven't been completed yet.
 * Indicates whether each missing gate is required or recommended.
 */
export function getMissingGates(size: PlanSize, gates: PlanGates): GateRequirement[] {
	const reqs = GATE_REQUIREMENTS[size];
	if (!reqs) return [];

	const missing: GateRequirement[] = [];

	// Pipeline order: PRD → pre-mortem → review
	if (!gates.has_prd) {
		missing.push(reqs.prd);
	}
	if (!gates.has_pre_mortem) {
		missing.push(reqs.preMortem);
	}
	if (!gates.has_review) {
		missing.push(reqs.review);
	}

	return missing;
}

/**
 * Check if a plan is ready for approval.
 * Ready = all mandatory gates for the plan's size are satisfied.
 * Optional and recommended gates don't block approval.
 */
export function isReadyToApprove(size: PlanSize, gates: PlanGates): ApprovalReadiness {
	const missing = getMissingGates(size, gates);
	const requiredMissing = missing.filter((g) => g.required);

	return {
		ready: requiredMissing.length === 0,
		missing: requiredMissing,
	};
}
