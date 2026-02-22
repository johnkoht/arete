/**
 * Widget module for plan mode (simplified).
 *
 * Pure rendering functions for plan status display.
 * Receives state and theme, returns styled strings.
 */

import type { PlanSize, PlanStatus } from "./persistence.js";

/** PRD progress snapshot for build-mode footer */
export interface WidgetPrdProgress {
	completed: number;
	total: number;
	currentTask: { index: number; title: string } | null;
}

/** State for widget rendering */
export interface WidgetState {
	planModeEnabled: boolean;
	executionMode: boolean;
	planId: string | null;
	title: string | null;
	status: PlanStatus | null;
	planSize: PlanSize | null;
	stepsCount: number;
	todosCompleted: number;
	todosTotal: number;
	hasPreMortem: boolean;
	hasReview: boolean;
	hasPrd: boolean;
	/** PRD progress for build-mode footer (populated when hasPrd && executionMode) */
	prdProgress?: WidgetPrdProgress;
}

/** Minimal theme interface for widget rendering (subset of Pi's Theme) */
export interface WidgetTheme {
	fg(color: string, text: string): string;
	strikethrough(text: string): string;
}

/**
 * Render footer status text for plan mode.
 * Returns a single-line status string or undefined if not in plan/execution mode.
 *
 * Plan format: 📋 {Title} ({slug}) • {status}, {size}, {N} steps • ☑pm ☐rv ☐prd
 * Execution format: ⚡ {slug} — X/Y steps
 *
 * When width is provided, truncation is applied:
 *   1. Truncate title first
 *   2. Drop step count
 *   3. Abbreviate size to first letter
 *   Minimum: 📋 … ({slug}) • {status} • ☐pm ☐rv ☐prd
 */
export function renderFooterStatus(state: WidgetState, theme: WidgetTheme, width?: number): string | undefined {
	const { planModeEnabled, executionMode, planId, title, status, planSize, stepsCount, todosCompleted, todosTotal, hasPreMortem, hasReview, hasPrd } = state;

	// Execution mode: show progress (PRD-based)
	if (executionMode && state.prdProgress && state.prdProgress.total > 0) {
		const label = planId ?? "build";
		const raw = buildExecutionFooter(label, state.prdProgress);
		const truncated = width != null ? truncateExecutionFooter(raw, label, state.prdProgress, width) : raw;
		return theme.fg("accent", truncated);
	}

	// Execution mode: show progress (todo-based)
	if (executionMode && todosTotal > 0) {
		const label = planId ?? "build";
		return theme.fg("accent", `⚡ ${label} — ${todosCompleted}/${todosTotal} steps`);
	}

	// Completed
	if (status === "complete") {
		const label = planId ?? "plan";
		return theme.fg("success", `✅ ${label} complete`);
	}

	// Plan mode with plan loaded
	if (planModeEnabled && planId) {
		const raw = buildPlanFooter(state);
		const truncated = width != null ? truncatePlanFooter(raw, width) : raw;
		return theme.fg("warning", truncated);
	}

	// Plan mode but no plan yet
	if (planModeEnabled) {
		return theme.fg("warning", "📋 plan mode");
	}

	// Not in plan mode
	return undefined;
}

/** Format gate checkboxes */
function formatGates(hasPreMortem: boolean, hasReview: boolean, hasPrd: boolean): string {
	const pm = hasPreMortem ? "☑pm" : "☐pm";
	const rv = hasReview ? "☑rv" : "☐rv";
	const prd = hasPrd ? "☑prd" : "☐prd";
	return `${pm} ${rv} ${prd}`;
}

/** Internal structure for plan footer parts (before theme wrapping) */
interface PlanFooterParts {
	title: string | null;
	slug: string;
	statusLabel: string;
	sizeLabel: string | null;
	stepsLabel: string | null;
	gates: string;
}

/** Build the full plan footer string (no truncation) */
function buildPlanFooter(state: WidgetState): string {
	const parts = getPlanFooterParts(state);
	return assemblePlanFooter(parts);
}

/** Extract footer parts from state */
function getPlanFooterParts(state: WidgetState): PlanFooterParts {
	return {
		title: state.title,
		slug: state.planId ?? "plan",
		statusLabel: state.status ?? "draft",
		sizeLabel: state.planSize ?? null,
		stepsLabel: state.stepsCount > 0 ? `${state.stepsCount} steps` : null,
		gates: formatGates(state.hasPreMortem, state.hasReview, state.hasPrd),
	};
}

/** Assemble footer string from parts */
function assemblePlanFooter(parts: PlanFooterParts): string {
	const titlePart = parts.title ? `${parts.title} ` : "";
	const middleParts = [parts.statusLabel, parts.sizeLabel, parts.stepsLabel].filter(Boolean).join(", ");
	return `📋 ${titlePart}(${parts.slug}) • ${middleParts} • ${parts.gates}`;
}

/**
 * Truncate plan footer to fit within width.
 * Priority: 1) truncate title, 2) drop steps, 3) abbreviate size.
 * Minimum: 📋 … ({slug}) • {status} • gates
 */
function truncatePlanFooter(full: string, width: number): string {
	// Note: 📋 is a multi-byte emoji but typically renders as ~2 columns.
	// We use string length as an approximation since exact terminal width
	// measurement varies by terminal. The emoji "📋" counts as 2 chars in length.
	if (visualLength(full) <= width) return full;

	// Get parts to rebuild with truncation
	// We need to parse the state again — instead, let's rebuild from scratch
	// Actually, let's just work with string manipulation on the known format

	// Strategy: rebuild with progressively shorter content
	// We know the format: 📋 {Title} ({slug}) • {status}, {size}, {steps} • {gates}

	// Parse the full string to extract components
	const match = full.match(/^📋 (.+?) \(([^)]+)\) • (.+) • (☐?☑?pm ☐?☑?rv ☐?☑?prd)$/);
	if (!match) return full; // shouldn't happen, but safety

	// Better regex for gates that handles ☑ and ☐ properly
	const gatesMatch = full.match(/((?:☑|☐)pm (?:☑|☐)rv (?:☑|☐)prd)$/);
	if (!gatesMatch) return full;

	const gates = gatesMatch[1];
	const beforeGates = full.slice(0, full.length - gates.length - 3); // " • " before gates
	const slugMatch = beforeGates.match(/^📋 (.*?)\(([^)]+)\) • (.+)$/);
	if (!slugMatch) return full;

	const titleRaw = slugMatch[1].trim();
	const slug = slugMatch[2];
	const middleStr = slugMatch[3];

	// Parse middle: "status, size, N steps" or "status, size" or "status"
	const middleParts = middleStr.split(", ").map((s) => s.trim());
	const statusLabel = middleParts[0];
	const sizeLabel = middleParts.length > 1 && !middleParts[1].includes("steps") ? middleParts[1] : null;
	const stepsLabel = middleParts.find((p) => p.includes("steps")) ?? null;

	// Try 1: Truncate title
	if (titleRaw) {
		const withoutTitle = buildFromParts("…", slug, statusLabel, sizeLabel, stepsLabel, gates);
		if (visualLength(withoutTitle) > width) {
			// Title already minimal, try dropping steps
		} else {
			// Binary search for max title length
			const overhead = visualLength(withoutTitle) - visualLength("…");
			const available = width - overhead;
			if (available >= 2) {
				const truncTitle = truncateText(titleRaw, available);
				const result = buildFromParts(truncTitle, slug, statusLabel, sizeLabel, stepsLabel, gates);
				if (visualLength(result) <= width) return result;
			}
			return withoutTitle;
		}
	}

	// Try 2: Drop step count (and minimize title)
	{
		const withoutSteps = buildFromParts(titleRaw ? "…" : null, slug, statusLabel, sizeLabel, null, gates);
		if (visualLength(withoutSteps) <= width) {
			// See if we can fit some title
			if (titleRaw) {
				const overhead = visualLength(withoutSteps) - visualLength("…");
				const available = width - overhead;
				if (available >= 2) {
					const truncTitle = truncateText(titleRaw, available);
					return buildFromParts(truncTitle, slug, statusLabel, sizeLabel, null, gates);
				}
			}
			return withoutSteps;
		}
	}

	// Try 3: Abbreviate size to first letter
	{
		const abbrevSize = sizeLabel ? sizeLabel[0] : null;
		const minimal = buildFromParts(titleRaw ? "…" : null, slug, statusLabel, abbrevSize, null, gates);
		if (visualLength(minimal) <= width) {
			// See if we can fit some title
			if (titleRaw) {
				const overhead = visualLength(minimal) - visualLength("…");
				const available = width - overhead;
				if (available >= 2) {
					const truncTitle = truncateText(titleRaw, available);
					return buildFromParts(truncTitle, slug, statusLabel, abbrevSize, null, gates);
				}
			}
			return minimal;
		}
	}

	// Minimum: drop size entirely
	const minimum = buildFromParts(titleRaw ? "…" : null, slug, statusLabel, null, null, gates);
	if (visualLength(minimum) <= width) return minimum;

	// Absolute minimum: just slug + gates
	return `📋 (${slug}) • ${statusLabel} • ${gates}`;
}

function buildFromParts(
	title: string | null,
	slug: string,
	statusLabel: string,
	sizeLabel: string | null,
	stepsLabel: string | null,
	gates: string,
): string {
	const titlePart = title ? `${title} ` : "";
	const middleParts = [statusLabel, sizeLabel, stepsLabel].filter(Boolean).join(", ");
	return `📋 ${titlePart}(${slug}) • ${middleParts} • ${gates}`;
}

/** Truncate text to fit within maxLen, adding "…" if truncated */
function truncateText(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	if (maxLen <= 1) return "…";
	return text.slice(0, maxLen - 1) + "…";
}

/**
 * Approximate visual length of a string.
 * Counts most characters as 1, but common wide chars (emoji) as 2.
 */
function visualLength(str: string): number {
	// Simple approximation: count emoji as 2 width
	let len = 0;
	for (const ch of str) {
		const code = ch.codePointAt(0) ?? 0;
		// Common emoji ranges
		if (code > 0x1f000) {
			len += 2;
		} else {
			len += 1;
		}
	}
	return len;
}

// ────────────────────────────────────────────────────────────
// Execution (build) mode footer
// ────────────────────────────────────────────────────────────

/**
 * Build the full execution footer string.
 * Format: ⚡ {slug} — X/Y tasks • current: #N {title} • building
 */
function buildExecutionFooter(label: string, progress: WidgetPrdProgress): string {
	const parts = [`⚡ ${label} — ${progress.completed}/${progress.total} tasks`];
	if (progress.currentTask) {
		parts.push(`current: #${progress.currentTask.index} ${progress.currentTask.title}`);
	}
	parts.push(progress.completed === progress.total ? "complete" : "building");
	return parts.join(" • ");
}

/**
 * Truncate execution footer to fit within width.
 * Priority: 1) truncate current task title, 2) drop current task, 3) drop status.
 * Minimum: ⚡ {slug} — X/Y tasks
 */
function truncateExecutionFooter(
	full: string,
	label: string,
	progress: WidgetPrdProgress,
	width: number,
): string {
	if (visualLength(full) <= width) return full;

	const statusLabel = progress.completed === progress.total ? "complete" : "building";
	const base = `⚡ ${label} — ${progress.completed}/${progress.total} tasks`;

	// Try: truncate current task title
	if (progress.currentTask) {
		const withoutCurrent = `${base} • ${statusLabel}`;
		if (visualLength(withoutCurrent) > width) {
			// Drop status too — just base
			return visualLength(base) <= width ? base : base;
		}

		// Binary search for max title length
		const prefix = `${base} • current: #${progress.currentTask.index} `;
		const suffix = ` • ${statusLabel}`;
		const available = width - visualLength(prefix) - visualLength(suffix);
		if (available >= 2) {
			const truncTitle = truncateText(progress.currentTask.title, available);
			return `${prefix}${truncTitle}${suffix}`;
		}
		return withoutCurrent;
	}

	// No current task — just base + status
	const withStatus = `${base} • ${statusLabel}`;
	if (visualLength(withStatus) <= width) return withStatus;
	return base;
}

/**
 * Render todo list widget for execution mode.
 * Returns array of styled lines, or undefined if no todos.
 */
export function renderTodoWidget(
	todoItems: Array<{ text: string; completed: boolean }>,
	theme: WidgetTheme,
): string[] | undefined {
	if (todoItems.length === 0) return undefined;

	return todoItems.map((item) => {
		if (item.completed) {
			return (
				theme.fg("success", "☑ ") +
				theme.fg("muted", theme.strikethrough(item.text))
			);
		}
		return `${theme.fg("muted", "☐ ")}${item.text}`;
	});
}
