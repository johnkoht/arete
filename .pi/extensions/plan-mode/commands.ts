/**
 * Command handlers for plan mode (simplified).
 *
 * Commands: /plan [new|list|open|save|rename|status|delete], /approve, /review, /pre-mortem, /prd, /build
 *
 * Plan mode is a planning-only tool. No enforced workflow or mandatory gates.
 * Agent adapts behavior based on work type and plan size.
 */

import { execSync } from "node:child_process";
import {
	savePlan,
	loadPlan,
	listPlans,
	updatePlanFrontmatter,
	loadPlanArtifact,
	slugify,
	type PlanFrontmatter,
	type PlanStatus,
	type PlanSize,
} from "./persistence.js";
import {
	classifyPlanSize,
	extractTodoItems,
	PLAN_MODE_TOOLS,
	type TodoItem,
} from "./utils.js";
import { resolveExecutionProgress } from "./execution-progress.js";

const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

// ────────────────────────────────────────────────────────────
// Shared types for command handlers
// ────────────────────────────────────────────────────────────

/** Mutable extension state shared across commands (simplified) */
export interface PlanModeState {
	planModeEnabled: boolean;
	executionMode: boolean;
	currentSlug: string | null;
	planSize: PlanSize | null;
	planText: string;
	todoItems: TodoItem[];
	preMortemRun: boolean;
	reviewRun: boolean;
	prdConverted: boolean;
}

/** Create a fresh default state */
export function createDefaultState(): PlanModeState {
	return {
		planModeEnabled: false,
		executionMode: false,
		currentSlug: null,
		planSize: null,
		planText: "",
		todoItems: [],
		preMortemRun: false,
		reviewRun: false,
		prdConverted: false,
	};
}

/**
 * Minimal interface for the Pi extension API and context,
 * used by command handlers. Keeps commands testable without
 * importing Pi types directly.
 */
export interface CommandContext {
	ui: {
		select(title: string, options: string[]): Promise<string | undefined>;
		confirm(title: string, message: string): Promise<boolean>;
		notify(message: string, type?: "info" | "warning" | "error"): void;
		editor(title: string, prefill?: string): Promise<string | undefined>;
	};
	hasUI: boolean;
}

export interface CommandPi {
	sendUserMessage(content: string): void;
	sendMessage(
		message: { customType: string; content: string; display: boolean },
		options?: { triggerTurn?: boolean },
	): void;
	appendEntry<T>(customType: string, data?: T): void;
	setActiveTools(tools: string[]): void;
	getActiveTools(): string[];
}

// ────────────────────────────────────────────────────────────
// Git diff utilities for plan resume
// ────────────────────────────────────────────────────────────

/** Files changed since a given ISO date, from git */
export interface PlanDiff {
	files: string[];
	since: string;
}

/**
 * Get files changed since a given ISO date using git log.
 * Returns empty array on error (not a git repo, git not available, etc).
 */
export function getChangesSince(sinceDate: string): PlanDiff {
	try {
		const output = execSync(
			`git log --name-only --pretty=format: --since="${sinceDate}"`,
			{ encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
		);

		const files = output
			.split("\n")
			.map((f) => f.trim())
			.filter((f) => f.length > 0)
			.filter((f, i, arr) => arr.indexOf(f) === i);

		return { files, since: sinceDate };
	} catch {
		return { files: [], since: sinceDate };
	}
}

/** Parse "Feature: <slug>" metadata from a plan PRD artifact. */
export function extractPrdFeatureSlug(artifactContent: string): string | null {
	const match = artifactContent.match(/^Feature:\s+([a-z0-9-]+)\s*$/im);
	if (!match) return null;
	return match[1].trim();
}

/** Resolve which PRD feature slug to execute for a plan. */
export function resolvePrdFeatureSlug(planSlug: string): string {
	const artifact = loadPlanArtifact(planSlug, "prd.md");
	if (!artifact) return planSlug;

	const parsed = extractPrdFeatureSlug(artifact);
	return parsed ?? planSlug;
}

// ────────────────────────────────────────────────────────────
// /plan command handler
// ────────────────────────────────────────────────────────────

export async function handlePlan(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
	togglePlanMode: () => void,
): Promise<void> {
	const subcommand = args.trim().split(/\s+/);
	const cmd = subcommand[0]?.toLowerCase();

	if (!cmd) {
		togglePlanMode();
		return;
	}

	switch (cmd) {
		case "new":
			await handlePlanNew(ctx, pi, state, togglePlanMode);
			break;
		case "list":
			await handlePlanList(ctx, pi, state);
			break;
		case "open":
			await handlePlanOpen(subcommand[1], ctx, pi, state);
			break;
		case "save":
			await handlePlanSave(subcommand[1], ctx, pi, state);
			break;
		case "rename":
			await handlePlanRename(subcommand[1], ctx, pi, state);
			break;
		case "status":
			handlePlanStatus(ctx, state);
			break;
		case "delete": {
			const slugToDelete = subcommand[1] ?? state.currentSlug;
			if (slugToDelete) {
				await handlePlanDelete(slugToDelete, ctx, pi, state);
			} else {
				ctx.ui.notify("No plan specified. Usage: /plan delete <slug>", "warning");
			}
			break;
		}
		default:
			ctx.ui.notify(
				`Unknown subcommand: ${cmd}. Available: new, list, open, save, rename, status, delete`,
				"warning",
			);
	}
}

export function hasUnsavedPlanChanges(state: PlanModeState): boolean {
	if (!state.planText.trim() && state.todoItems.length === 0) {
		return false;
	}

	if (!state.currentSlug) {
		return true;
	}

	const savedPlan = loadPlan(state.currentSlug);
	if (!savedPlan) {
		return true;
	}

	return savedPlan.content.trim() !== state.planText.trim();
}

export function getSuggestedNextActions(
	status: PlanStatus,
	size: PlanSize,
	flags: { hasPreMortem: boolean; hasReview: boolean; hasPrd: boolean },
): string[] {
	const actions: string[] = [];

	if (status === "draft") {
		actions.push("/approve");
	}
	if (status === "ready") {
		actions.push("/build");
	}
	if (status === "building") {
		actions.push("/build status");
	}
	if (status === "complete") {
		actions.push("/plan new");
	}

	if (!flags.hasPreMortem && (size === "medium" || size === "large")) {
		actions.push("/pre-mortem");
	}
	if (!flags.hasReview && size === "large") {
		actions.push("/review");
	}
	if (!flags.hasPrd && (size === "medium" || size === "large")) {
		actions.push("/prd");
	}

	return actions;
}

async function handlePlanNew(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
	togglePlanMode: () => void,
): Promise<void> {
	if (hasUnsavedPlanChanges(state)) {
		const shouldSave = await ctx.ui.confirm(
			"Unsaved plan changes",
			"You have unsaved plan changes. Save before starting a new plan?",
		);
		if (shouldSave) {
			await handlePlanSave(undefined, ctx, pi, state);
		}
	}

	// Reset state for new plan
	state.currentSlug = null;
	state.planText = "";
	state.planSize = null;
	state.todoItems = [];
	state.preMortemRun = false;
	state.reviewRun = false;
	state.prdConverted = false;

	if (!state.planModeEnabled) {
		togglePlanMode();
	}

	ctx.ui.notify("📋 Plan mode enabled. Describe your idea and I'll help shape it into a plan.", "info");
}

async function handlePlanList(ctx: CommandContext, pi: CommandPi, state: PlanModeState): Promise<void> {
	const plans = listPlans();

	if (plans.length === 0) {
		ctx.ui.notify("No plans found in dev/plans/", "info");
		return;
	}

	const statusEmoji: Record<PlanStatus, string> = {
		draft: "📝",
		ready: "✅",
		building: "⚡",
		complete: "🎉",
	};

	const options = plans.map((p) => {
		const emoji = statusEmoji[p.frontmatter.status] ?? "📄";
		return `${emoji} ${p.frontmatter.title} (${p.frontmatter.status}, ${p.frontmatter.size}, ${p.frontmatter.steps} steps)`;
	});

	const selected = await ctx.ui.select("Plans", options);
	if (selected) {
		const index = options.indexOf(selected);
		if (index >= 0) {
			const plan = plans[index];
			await handlePlanOpen(plan.slug, ctx, pi, state);
		}
	}
}

async function handlePlanOpen(
	slug: string | undefined,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!slug) {
		ctx.ui.notify("Usage: /plan open <slug>", "warning");
		return;
	}

	const plan = loadPlan(slug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${slug}`, "error");
		return;
	}

	// Restore state from plan
	state.currentSlug = slug;
	state.planText = plan.content;
	state.planSize = plan.frontmatter.size;
	state.preMortemRun = plan.frontmatter.has_pre_mortem;
	state.reviewRun = plan.frontmatter.has_review;
	state.prdConverted = plan.frontmatter.has_prd;
	state.todoItems = extractTodoItems(plan.content);
	state.planModeEnabled = true;
	state.executionMode = false;
	pi.setActiveTools(PLAN_MODE_TOOLS);

	// Build status indicators
	const artifacts: string[] = [];
	if (plan.frontmatter.has_pre_mortem) artifacts.push("pre-mortem ✓");
	if (plan.frontmatter.has_review) artifacts.push("review ✓");
	if (plan.frontmatter.has_prd) artifacts.push("PRD ✓");
	const artifactsStr = artifacts.length > 0 ? ` — ${artifacts.join(", ")}` : "";

	ctx.ui.notify(
		`📋 Opened: ${plan.frontmatter.title} (${plan.frontmatter.status}, ${plan.frontmatter.size})${artifactsStr}`,
		"info",
	);

	// Show diff since plan was last updated
	const diff = getChangesSince(plan.frontmatter.updated);
	if (diff.files.length > 0) {
		const MAX_FILES = 10;
		const shown = diff.files.slice(0, MAX_FILES);
		const extra = diff.files.length > MAX_FILES ? `\n  ... and ${diff.files.length - MAX_FILES} more` : "";
		const fileList = shown.map((f) => `  ${f}`).join("\n");
		ctx.ui.notify(
			`📂 ${diff.files.length} file(s) changed since this plan was last updated:\n${fileList}${extra}`,
			"info",
		);
	}
}

export async function handlePlanSave(
	providedSlug: string | undefined,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.planText) {
		ctx.ui.notify("No plan to save. Create a plan first.", "warning");
		return;
	}

	// If user provided a slug AND we already have a different slug, guide to rename
	if (providedSlug && state.currentSlug && providedSlug !== state.currentSlug) {
		ctx.ui.notify(
			`Plan already saved as '${state.currentSlug}'. Use /plan rename ${providedSlug} to change the name.`,
			"warning",
		);
		return;
	}

	let slug = providedSlug ?? state.currentSlug;

	// First save: prompt user for a name
	if (!slug) {
		const titleMatch = state.planText.match(/^#\s+(.+)/m);
		const suggestedTitle = titleMatch ? titleMatch[1].trim() : "untitled-plan";
		const suggestedSlug = slugify(suggestedTitle);

		const userInput = await ctx.ui.editor("Name this plan:", suggestedSlug);
		if (!userInput?.trim()) {
			ctx.ui.notify("Save cancelled. Use /plan save to try again.", "info");
			return;
		}

		slug = slugify(userInput.trim());
		if (!slug) {
			ctx.ui.notify("Plan name must include letters or numbers.", "warning");
			return;
		}
	}

	const now = new Date().toISOString();
	const existingPlan = loadPlan(slug);

	const frontmatter: PlanFrontmatter = existingPlan
		? { ...existingPlan.frontmatter, updated: now, steps: state.todoItems.length }
		: {
				title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
				slug,
				status: "draft",
				size: state.planSize ?? "small",
				created: now,
				updated: now,
				completed: null,
				has_review: state.reviewRun,
				has_pre_mortem: state.preMortemRun,
				has_prd: state.prdConverted,
				backlog_ref: null,
				steps: state.todoItems.length,
			};

	savePlan(slug, frontmatter, state.planText);
	state.currentSlug = slug;

	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		todos: state.todoItems,
		executing: state.executionMode,
		currentSlug: state.currentSlug,
		planSize: state.planSize,
	});

	ctx.ui.notify(`💾 Saved to dev/plans/${slug}/plan.md`, "info");
}

/**
 * Handle /plan rename <new-name> command.
 * Renames the current plan by moving to a new folder and deleting the old one.
 */
export async function handlePlanRename(
	newName: string | undefined,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan to rename. Save a plan first with /plan save.", "warning");
		return;
	}

	if (!state.planText) {
		ctx.ui.notify("No plan content to rename.", "warning");
		return;
	}

	// Prompt for new name if not provided
	let newSlug: string;
	if (newName) {
		newSlug = slugify(newName);
	} else {
		const userInput = await ctx.ui.editor("Rename plan to:", state.currentSlug);
		if (!userInput?.trim()) {
			ctx.ui.notify("Rename cancelled.", "info");
			return;
		}
		newSlug = slugify(userInput.trim());
	}

	if (!newSlug) {
		ctx.ui.notify("Plan name must include letters or numbers.", "warning");
		return;
	}

	if (newSlug === state.currentSlug) {
		ctx.ui.notify("New name is the same as current name.", "info");
		return;
	}

	// Check if target already exists
	const targetExists = loadPlan(newSlug);
	if (targetExists) {
		ctx.ui.notify(`A plan named '${newSlug}' already exists. Choose a different name.`, "warning");
		return;
	}

	const oldSlug = state.currentSlug;
	const oldPlan = loadPlan(oldSlug);
	if (!oldPlan) {
		ctx.ui.notify(`Could not load current plan: ${oldSlug}`, "error");
		return;
	}

	// Create new plan with updated frontmatter
	const now = new Date().toISOString();
	const newFrontmatter: PlanFrontmatter = {
		...oldPlan.frontmatter,
		title: newSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
		slug: newSlug,
		updated: now,
	};

	// Save to new location
	savePlan(newSlug, newFrontmatter, state.planText);

	// Delete old plan folder
	const { deletePlan } = await import("./persistence.js");
	deletePlan(oldSlug);

	// Update state
	state.currentSlug = newSlug;

	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		todos: state.todoItems,
		executing: state.executionMode,
		currentSlug: state.currentSlug,
		planSize: state.planSize,
	});

	ctx.ui.notify(`📝 Renamed '${oldSlug}' → '${newSlug}' (dev/plans/${newSlug}/)`, "info");
}

function handlePlanStatus(ctx: CommandContext, state: PlanModeState): void {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Use /plan open <slug> or /plan save to start.", "info");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	const fm = plan.frontmatter;

	// Build artifact list
	const artifacts: string[] = [];
	if (fm.has_pre_mortem) artifacts.push("pre-mortem ✓");
	if (fm.has_review) artifacts.push("review ✓");
	if (fm.has_prd) artifacts.push("PRD ✓");

	// Build recommendations based on size
	const recommendations: string[] = [];
	if (!fm.has_pre_mortem && (fm.size === "medium" || fm.size === "large")) {
		recommendations.push("Consider running /pre-mortem before building");
	}
	if (!fm.has_review && fm.size === "large") {
		recommendations.push("Consider running /review for a second opinion");
	}

	const lines = [
		`📋 **${fm.title}**`,
		`Status: ${fm.status} | Size: ${fm.size} | Steps: ${fm.steps}`,
	];

	if (artifacts.length > 0) {
		lines.push(`Artifacts: ${artifacts.join(", ")}`);
	}

	if (recommendations.length > 0) {
		lines.push(`\nRecommendations:\n${recommendations.map((r) => `  • ${r}`).join("\n")}`);
	}

	if (fm.status === "ready") {
		lines.push("\n✅ Ready to build. Run /build to start execution.");
	} else if (fm.status === "draft") {
		lines.push("\n📝 Draft. Run /approve when ready to build.");
	}

	const nextActions = getSuggestedNextActions(fm.status, fm.size, {
		hasPreMortem: fm.has_pre_mortem,
		hasReview: fm.has_review,
		hasPrd: fm.has_prd,
	});
	if (nextActions.length > 0) {
		lines.push(`\nNext: ${nextActions.join(" · ")}`);
	}

	ctx.ui.notify(lines.join("\n"), "info");
}

async function handlePlanDelete(
	slug: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	const { deletePlan } = await import("./persistence.js");
	const confirmed = await ctx.ui.confirm("Delete Plan", `Delete plan '${slug}' and all its artifacts?`);
	if (!confirmed) return;

	deletePlan(slug);
	if (state.currentSlug === slug) {
		state.currentSlug = null;
		state.planText = "";
		state.planSize = null;
	}
	ctx.ui.notify(`🗑 Plan deleted: ${slug}`, "info");
}

// ────────────────────────────────────────────────────────────
// /approve command handler
// ────────────────────────────────────────────────────────────

export async function handleApprove(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Save a plan first with /plan save.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	if (plan.frontmatter.status === "ready") {
		ctx.ui.notify("Plan is already ready. Run /build to start execution.", "info");
		return;
	}

	if (plan.frontmatter.status === "building") {
		ctx.ui.notify("Plan is already being built.", "info");
		return;
	}

	if (plan.frontmatter.status === "complete") {
		ctx.ui.notify("Plan is already complete.", "info");
		return;
	}

	// Offer recommendations before approving
	const recommendations: string[] = [];
	if (!state.preMortemRun && (state.planSize === "medium" || state.planSize === "large")) {
		recommendations.push("Pre-mortem not run (recommended for medium/large plans)");
	}
	if (!state.reviewRun && state.planSize === "large") {
		recommendations.push("Review not run (recommended for large plans)");
	}

	if (recommendations.length > 0) {
		const proceed = await ctx.ui.confirm(
			"Approve Plan",
			`Recommendations:\n${recommendations.map((r) => `• ${r}`).join("\n")}\n\nApprove anyway?`,
		);
		if (!proceed) return;
	}

	updatePlanFrontmatter(state.currentSlug, { status: "ready" });

	ctx.ui.notify("✅ Plan marked ready! Run /build to start execution.", "info");

	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		todos: state.todoItems,
		executing: state.executionMode,
		currentSlug: state.currentSlug,
		planSize: state.planSize,
	});
}

// ────────────────────────────────────────────────────────────
// /review command handler
// ────────────────────────────────────────────────────────────

export async function handleReview(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Save a plan first with /plan save.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	ctx.ui.notify("🔍 Starting cross-model review...", "info");

	pi.sendUserMessage(
		`Review this plan using the review-plan skill. Load .agents/skills/review-plan/SKILL.md and follow its workflow.\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	state.reviewRun = true;
	updatePlanFrontmatter(state.currentSlug, { has_review: true });
}

// ────────────────────────────────────────────────────────────
// /pre-mortem command handler
// ────────────────────────────────────────────────────────────

export async function handlePreMortem(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Save a plan first with /plan save.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	ctx.ui.notify("🛡 Starting pre-mortem analysis...", "info");

	pi.sendUserMessage(
		`Run a pre-mortem risk analysis on this plan. Load .agents/skills/run-pre-mortem/SKILL.md and follow its workflow.\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	state.preMortemRun = true;
	updatePlanFrontmatter(state.currentSlug, { has_pre_mortem: true });
}

// ────────────────────────────────────────────────────────────
// /prd command handler
// ────────────────────────────────────────────────────────────

export async function handlePrd(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Save a plan first with /plan save.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	const defaultFeatureName = state.currentSlug ?? slugify(plan.frontmatter.title);
	const requestedFeatureName = await ctx.ui.editor(
		"PRD feature name (used for dev/prds/{feature-name}/):",
		defaultFeatureName,
	);

	if (!requestedFeatureName?.trim()) {
		ctx.ui.notify("Skipped PRD conversion (feature name not provided).", "info");
		return;
	}

	const featureSlug = slugify(requestedFeatureName.trim());
	if (!featureSlug) {
		ctx.ui.notify("PRD feature name must include letters or numbers.", "warning");
		return;
	}

	ctx.ui.notify(`📄 Converting plan to PRD as '${featureSlug}'...`, "info");

	pi.sendUserMessage(
		`Convert this plan to a PRD. Load .agents/skills/plan-to-prd/SKILL.md and follow its workflow.\n\n` +
			`Use this exact feature name: ${featureSlug}.\n` +
			`Create artifacts under dev/prds/${featureSlug}/ (do not derive a different slug).\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	state.prdConverted = true;
	updatePlanFrontmatter(state.currentSlug, { has_prd: true });
}

// ────────────────────────────────────────────────────────────
// /build command handler
// ────────────────────────────────────────────────────────────

export async function handleBuild(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	const subcommand = args.trim().toLowerCase();

	if (subcommand === "status") {
		handleBuildStatus(ctx, state);
		return;
	}

	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Save and approve a plan first.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	// Check if plan is approved (ready)
	if (plan.frontmatter.status === "draft") {
		const proceed = await ctx.ui.confirm(
			"Plan Not Ready",
			"This plan is still a draft. Mark it ready and start building?",
		);
		if (!proceed) return;
		updatePlanFrontmatter(state.currentSlug, { status: "ready" });
	}

	if (plan.frontmatter.status === "complete") {
		ctx.ui.notify("This plan is already complete.", "info");
		return;
	}

	// Transition to building
	updatePlanFrontmatter(state.currentSlug, { status: "building" });

	state.planModeEnabled = false;
	state.executionMode = true;
	pi.setActiveTools(NORMAL_MODE_TOOLS);

	ctx.ui.notify("⚡ Build started!", "info");

	if (plan.frontmatter.has_prd) {
		// Has PRD: invoke execute-prd skill
		const prdFeatureSlug = resolvePrdFeatureSlug(state.currentSlug);
		pi.sendUserMessage(
			`Execute the ${prdFeatureSlug} PRD. Load the execute-prd skill from .pi/skills/execute-prd/SKILL.md. ` +
				`The PRD is at dev/prds/${prdFeatureSlug}/prd.md and the task list is at dev/plans/${state.currentSlug}/prd.json. ` +
				`Run the full workflow.`,
		);
	} else {
		// No PRD: direct execution
		const remaining = state.todoItems.filter((t) => !t.completed);
		const firstStep = remaining[0]?.text ?? "the plan";
		pi.sendMessage(
			{
				customType: "plan-mode-execute",
				content: `Execute the plan. Start with: ${firstStep}`,
				display: true,
			},
			{ triggerTurn: true },
		);
	}

	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		todos: state.todoItems,
		executing: state.executionMode,
		currentSlug: state.currentSlug,
		planSize: state.planSize,
	});
}

function handleBuildStatus(ctx: CommandContext, state: PlanModeState): void {
	if (!state.executionMode && !state.currentSlug) {
		ctx.ui.notify("No active build.", "info");
		return;
	}

	const plan = state.currentSlug ? loadPlan(state.currentSlug) : null;
	const hasPrd = Boolean(plan?.frontmatter.has_prd ?? state.prdConverted);
	const progress = resolveExecutionProgress({
		hasPrd,
		todoItems: state.todoItems,
		prdPath: state.currentSlug ? `dev/plans/${state.currentSlug}/prd.json` : undefined,
	});

	const lines = [`⚡ Build Status: ${progress.completed}/${progress.total} tasks complete`];

	if (progress.currentTask) {
		lines.push(`Current: #${progress.currentTask.index} ${progress.currentTask.title} (${progress.currentTask.status})`);
	}

	if (progress.tasks.length === 0) {
		lines.push("🎉 All tasks complete!");
		ctx.ui.notify(lines.join("\n"), "info");
		return;
	}

	lines.push("\nTasks:");
	for (const task of progress.tasks) {
		const marker =
			task.status === "complete"
				? "☑"
				: task.status === "in_progress"
					? "▸"
					: task.status === "failed"
						? "✖"
						: "☐";
		lines.push(`  ${marker} ${task.index}. ${task.title} (${task.status})`);
	}

	ctx.ui.notify(lines.join("\n"), "info");
}
