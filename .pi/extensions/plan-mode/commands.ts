/**
 * Command handlers for plan mode (simplified).
 *
 * Commands: /plan [new|list|open|save|rename|status|delete|archive], /approve, /review, /pre-mortem, /prd, /build
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
	listArchive,
	archiveItem,
	type PlanFrontmatter,
	type PlanStatus,
	type PlanSize,
} from "./persistence.js";
import {
	classifyPlanSize,
	extractTodoItems,

	type TodoItem,
} from "./utils.js";
import { resolveExecutionProgress } from "./execution-progress.js";

// ────────────────────────────────────────────────────────────
// Shared types for command handlers
// ────────────────────────────────────────────────────────────

/** Mutable extension state shared across commands (simplified) */
export interface PlanModeState {
	planModeEnabled: boolean;
	executionMode: boolean;
	currentSlug: string | null;
	planTitle: string | null;
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
		planTitle: null,
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
		custom?<T>(factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (result: T) => void) => unknown): Promise<T>;
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

/**
 * Commit plan folder to git before build starts.
 * Stages everything under dev/work/plans/{slug}/ and commits.
 * Silently no-ops if git is unavailable, not a repo, or nothing to commit.
 */
export function commitPlanToGit(slug: string): boolean {
	try {
		const planDir = `dev/work/plans/${slug}/`;
		execSync(`git add "${planDir}"`, {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		execSync(`git diff --cached --quiet "${planDir}"`, {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		// diff --cached --quiet exits 0 if nothing staged → nothing to commit
		return false;
	} catch {
		// diff --cached --quiet exits 1 if there ARE staged changes — that's the happy path
		try {
			execSync(`git commit -m "plan: ${slug}"`, {
				encoding: "utf-8",
				timeout: 10000,
				stdio: ["pipe", "pipe", "pipe"],
			});
			return true;
		} catch {
			return false;
		}
	}
}

/** Parse "Feature: <slug>" metadata from a plan PRD artifact. */
export function extractPrdFeatureSlug(artifactContent: string): string | null {
	const match = artifactContent.match(/^Feature:\s+([a-z0-9-]+)\s*$/im);
	if (!match) return null;
	return match[1].trim();
}

/** Resolve which PRD feature slug to execute for a plan.
 * PRD is always co-located with the plan, so feature slug = plan slug.
 */
export function resolvePrdFeatureSlug(planSlug: string): string {
	return planSlug;
}

/**
 * Check whether a PRD-based (or todo-based) execution is fully complete.
 * Used to guard against re-triggering a finished build.
 */
export function checkPrdExecutionComplete(
	planSlug: string,
	hasPrd?: boolean,
	resolveProgressFn = resolveExecutionProgress,
): boolean {
	const prdFeatureSlug = resolvePrdFeatureSlug(planSlug);
	const progress = resolveProgressFn({
		hasPrd: Boolean(hasPrd),
		todoItems: [],
		prdPath: `dev/work/plans/${prdFeatureSlug}/prd.json`,
	});
	return progress.total > 0 && progress.completed === progress.total;
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
			await handlePlanNew(subcommand.slice(1).join(" "), ctx, pi, state, togglePlanMode);
			break;
		case "list":
			await handlePlanList(subcommand.slice(1).join(" "), ctx, pi, state);
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
			await handlePlanStatus(subcommand.slice(1).join(" "), ctx, state);
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
		case "archive":
			await handleArchive(subcommand.slice(1).join(" "), ctx, pi, state);
			break;
		default:
			ctx.ui.notify(
				`Unknown subcommand: ${cmd}. Available: new, list, open, save, rename, status, delete, archive`,
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

	if (status === "idea") {
		actions.push("/approve");
	}
	if (status === "draft") {
		actions.push("/approve");
	}
	if (status === "planned") {
		actions.push("/build");
	}
	if (status === "building") {
		actions.push("/build status");
	}
	if (status === "complete" || status === "abandoned") {
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
	nameArg: string,
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
	state.planTitle = null;
	state.planText = "";
	state.planSize = null;
	state.todoItems = [];
	state.preMortemRun = false;
	state.reviewRun = false;
	state.prdConverted = false;

	if (!state.planModeEnabled) {
		togglePlanMode();
	}

	const trimmedName = nameArg.trim();
	let nameToUse: string | null = null;

	if (trimmedName) {
		// Path 1: Name provided as argument
		nameToUse = trimmedName;
	} else {
		// Path 2/3: Prompt for name via editor
		const editorResult = await ctx.ui.editor("Name this plan:", "");
		if (editorResult?.trim()) {
			nameToUse = editorResult.trim();
		}
	}

	if (nameToUse) {
		// Auto-save the plan stub to disk
		const slug = slugify(nameToUse);
		const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		const now = new Date().toISOString();
		const content = `# ${title}\n`;
		const frontmatter: PlanFrontmatter = {
			title,
			slug,
			status: "idea",
			size: "unknown",
			tags: [],
			created: now,
			updated: now,
			completed: null,
			execution: null,
			has_review: false,
			has_pre_mortem: false,
			has_prd: false,
			steps: 0,
		};

		savePlan(slug, frontmatter, content);

		state.currentSlug = slug;
		state.planTitle = title;
		state.planText = content;

		ctx.ui.notify(`📋 Plan '${slug}' created and saved. Describe your idea and I'll help shape it.`, "info");
	} else {
		// Path 3: Editor cancelled — no save, notify user
		state.planTitle = null;
		state.planText = "";

		ctx.ui.notify("📋 Plan mode enabled. Plan not saved — use /plan save <name> to persist.", "info");
	}
}

/** Status emoji mapping used for plan list items */
const STATUS_EMOJI: Record<PlanStatus, string> = {
	building: "⚡",
	planned: "✅",
	draft: "📝",
	idea: "💡",
	complete: "🎉",
	abandoned: "🚫",
};

/** Status sort priority — lower number sorts first */
const STATUS_PRIORITY: Record<PlanStatus, number> = {
	building: 0,
	planned: 1,
	draft: 2,
	idea: 3,
	complete: 4,
	abandoned: 5,
};

/** A prepared list item for the plan list UI */
export interface PlanListItem {
	value: string;
	label: string;
	description: string;
}

/** Filter type for plan list */
export type PlanListFilter = "ideas" | "active" | "all";

/** Parse filter flags from args string */
export function parsePlanListFilter(args: string): PlanListFilter {
	const trimmed = args.trim().toLowerCase();
	if (trimmed.includes("--ideas")) return "ideas";
	if (trimmed.includes("--active")) return "active";
	return "all";
}

/** Filter and sort plans, then build list items. Pure function for testability. */
export function preparePlanListItems(
	plans: Array<{ slug: string; frontmatter: PlanFrontmatter }>,
	filter: PlanListFilter,
): PlanListItem[] {
	let filtered = plans;

	if (filter === "ideas") {
		filtered = plans.filter((p) => p.frontmatter.status === "idea");
	} else if (filter === "active") {
		filtered = plans.filter((p) =>
			p.frontmatter.status === "draft" ||
			p.frontmatter.status === "planned" ||
			p.frontmatter.status === "building",
		);
	}

	const sorted = [...filtered].sort((a, b) => {
		const pa = STATUS_PRIORITY[a.frontmatter.status] ?? 5;
		const pb = STATUS_PRIORITY[b.frontmatter.status] ?? 5;
		return pa - pb;
	});

	return sorted.map((p) => {
		const emoji = STATUS_EMOJI[p.frontmatter.status] ?? "📄";
		return {
			value: p.slug,
			label: `${emoji} ${p.frontmatter.title} (${p.slug})`,
			description: `${p.frontmatter.size}, ${p.frontmatter.steps} steps`,
		};
	});
}

async function handlePlanList(args: string, ctx: CommandContext, pi: CommandPi, state: PlanModeState): Promise<void> {
	const plans = listPlans();
	const filter = parsePlanListFilter(args);
	const items = preparePlanListItems(plans, filter);

	if (items.length === 0) {
		ctx.ui.notify("No plans found in dev/work/plans/", "info");
		return;
	}

	let selectedSlug: string | null = null;

	// Try rich UI if available
	if (ctx.hasUI && ctx.ui.custom) {
		const { Container, SelectList, Text } = await import("@mariozechner/pi-tui");
		const { DynamicBorder } = await import("@mariozechner/pi-coding-agent");

		selectedSlug = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const typedTheme = theme as {
				fg(color: string, text: string): string;
				bold(text: string): string;
			};

			const container = new Container();
			container.addChild(new DynamicBorder((str: string) => typedTheme.fg("accent", str)));

			// Header
			const headerText = filter === "all" ? "Plans" : filter === "ideas" ? "Plans (ideas)" : "Plans (active)";
			container.addChild(new Text(typedTheme.fg("accent", typedTheme.bold(headerText))));

			// SelectList
			const selectList = new SelectList(items, Math.min(items.length, 15), {
				selectedPrefix: (text: string) => typedTheme.fg("accent", text),
				selectedText: (text: string) => typedTheme.fg("accent", text),
				description: (text: string) => typedTheme.fg("muted", text),
				scrollInfo: (text: string) => typedTheme.fg("dim", text),
				noMatch: (text: string) => typedTheme.fg("warning", text),
			});

			selectList.onSelect = (item: { value: string }) => done(item.value);
			selectList.onCancel = () => done(null);

			container.addChild(selectList);

			// Footer hint
			container.addChild(new Text(typedTheme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
			container.addChild(new DynamicBorder((str: string) => typedTheme.fg("accent", str)));

			const typedTui = tui as { requestRender(): void };
			return {
				render(width: number) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					selectList.handleInput(data);
					typedTui.requestRender();
				},
			};
		});
	} else {
		// Fallback: simple select
		const options = items.map((item) => item.label);
		const selected = await ctx.ui.select("Plans", options);
		if (selected) {
			const index = options.indexOf(selected);
			if (index >= 0) {
				selectedSlug = items[index].value;
			}
		}
	}

	if (selectedSlug) {
		await handlePlanOpen(selectedSlug, ctx, pi, state);
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
	state.planTitle = plan.frontmatter.title;
	state.planText = plan.content;
	state.planSize = plan.frontmatter.size;
	state.preMortemRun = plan.frontmatter.has_pre_mortem;
	state.reviewRun = plan.frontmatter.has_review;
	state.prdConverted = plan.frontmatter.has_prd;
	state.todoItems = extractTodoItems(plan.content);
	state.planModeEnabled = true;
	state.executionMode = false;

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
				tags: [],
				created: now,
				updated: now,
				completed: null,
				execution: null,
				has_review: state.reviewRun,
				has_pre_mortem: state.preMortemRun,
				has_prd: state.prdConverted,
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

	ctx.ui.notify(`💾 Saved to dev/work/plans/${slug}/plan.md`, "info");
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

	ctx.ui.notify(`📝 Renamed '${oldSlug}' → '${newSlug}' (dev/work/plans/${newSlug}/)`, "info");
}

/** Statuses that can be set directly via /plan status <status> */
const SETTABLE_STATUSES: ReadonlySet<PlanStatus> = new Set(["idea", "draft", "planned"]);

export async function handlePlanStatus(args: string, ctx: CommandContext, state: PlanModeState): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Use /plan open <slug> or /plan save to start.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	const targetStatus = args.trim().split(/\s+/)[0]?.toLowerCase();

	// If no args provided, show current status info
	if (!targetStatus) {
		showPlanStatusInfo(ctx, plan.frontmatter);
		return;
	}

	// Handle restricted statuses
	if (targetStatus === "building") {
		ctx.ui.notify("Use /build to start execution", "error");
		return;
	}
	if (targetStatus === "complete") {
		ctx.ui.notify("Use /plan archive to complete a plan", "error");
		return;
	}
	if (targetStatus === "abandoned") {
		ctx.ui.notify("Use /plan archive to abandon a plan", "error");
		return;
	}

	// Validate against settable statuses
	if (!SETTABLE_STATUSES.has(targetStatus as PlanStatus)) {
		ctx.ui.notify(
			`Invalid status '${targetStatus}'. Valid options: idea, draft, planned (use /build or /plan archive for other transitions)`,
			"error",
		);
		return;
	}

	const validTarget = targetStatus as PlanStatus;
	const currentStatus = plan.frontmatter.status;

	if (validTarget === currentStatus) {
		ctx.ui.notify(`Status is already '${currentStatus}'`, "info");
		return;
	}

	// Confirm with user
	const confirmed = await ctx.ui.confirm(
		"Change Status",
		`Change status from '${currentStatus}' to '${validTarget}'?`,
	);
	if (!confirmed) {
		ctx.ui.notify("Status change cancelled", "info");
		return;
	}

	// Persist to disk
	updatePlanFrontmatter(state.currentSlug, { status: validTarget });
	ctx.ui.notify(`✅ Status changed: '${currentStatus}' → '${validTarget}'`, "info");
}

function showPlanStatusInfo(ctx: CommandContext, fm: PlanFrontmatter): void {
	// Build gate list with ☑/☐
	const gates: string[] = [];
	gates.push(fm.has_pre_mortem ? "pre-mortem ☑" : "pre-mortem ☐");
	gates.push(fm.has_review ? "review ☑" : "review ☐");
	gates.push(fm.has_prd ? "PRD ☑" : "PRD ☐");

	// Build recommendations based on size
	const recommendations: string[] = [];
	if (!fm.has_pre_mortem && (fm.size === "medium" || fm.size === "large")) {
		recommendations.push("Consider running /pre-mortem before building");
	}
	if (!fm.has_review && fm.size === "large") {
		recommendations.push("Consider running /review for a second opinion");
	}

	const lines = [
		`📋 **${fm.title}** (${fm.slug})`,
		`Status: ${fm.status} | Size: ${fm.size} | Steps: ${fm.steps}`,
		`Gates: ${gates.join(", ")}`,
	];

	if (recommendations.length > 0) {
		lines.push(`\nRecommendations:\n${recommendations.map((r) => `  • ${r}`).join("\n")}`);
	}

	if (fm.status === "planned") {
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
// /plan archive command handler
// ────────────────────────────────────────────────────────────

export async function handleArchive(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	const trimmed = args.trim().toLowerCase();

	if (trimmed === "list") {
		await handleArchiveList(ctx);
		return;
	}

	if (trimmed && trimmed !== "") {
		// Archive a specific plan by slug
		const slug = trimmed;
		const confirmed = await ctx.ui.confirm("Archive Plan", `Archive plan '${slug}'?`);
		if (!confirmed) return;

		const status = await ctx.ui.select("Archive as:", ["✅ Complete", "🚫 Abandoned"]);
		if (!status) return;

		const archiveStatus = status.includes("Complete") ? "complete" as const : "abandoned" as const;

		try {
			archiveItem(slug, archiveStatus);
			ctx.ui.notify(`📁 Archived to dev/work/archive/${slug}/`, "info");

			if (state.currentSlug === slug) {
				state.currentSlug = null;
				state.planText = "";
				state.planSize = null;
				state.todoItems = [];
				state.preMortemRun = false;
				state.reviewRun = false;
				state.prdConverted = false;
			}
		} catch (err) {
			ctx.ui.notify(`Failed to archive: ${err instanceof Error ? err.message : String(err)}`, "error");
		}
		return;
	}

	// No args: archive current plan
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan to archive. Usage: /plan archive [slug] or /plan archive list", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	const title = plan?.frontmatter.title ?? state.currentSlug;

	const status = await ctx.ui.select(`Archive '${title}' as:`, ["✅ Complete", "🚫 Abandoned"]);
	if (!status) return;

	const archiveStatus = status.includes("Complete") ? "complete" as const : "abandoned" as const;

	try {
		archiveItem(state.currentSlug, archiveStatus);
		ctx.ui.notify(`📁 Archived to dev/work/archive/${state.currentSlug}/`, "info");

		state.currentSlug = null;
		state.planText = "";
		state.planSize = null;
		state.todoItems = [];
		state.preMortemRun = false;
		state.reviewRun = false;
		state.prdConverted = false;
	} catch (err) {
		ctx.ui.notify(`Failed to archive: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}

async function handleArchiveList(ctx: CommandContext): Promise<void> {
	const items = listArchive();

	if (items.length === 0) {
		ctx.ui.notify("No archived items found in dev/work/archive/", "info");
		return;
	}

	const statusEmoji: Record<PlanStatus, string> = {
		idea: "💡",
		draft: "📝",
		planned: "✅",
		building: "⚡",
		complete: "🎉",
		abandoned: "🚫",
	};

	const options = items.map((item) => {
		const emoji = statusEmoji[item.frontmatter.status] ?? "📄";
		return `${emoji} ${item.frontmatter.title}`;
	});

	await ctx.ui.select("Archive", options);
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

	if (plan.frontmatter.status === "planned") {
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

	updatePlanFrontmatter(state.currentSlug, { status: "planned" });

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

	const featureSlug = state.currentSlug ?? slugify(plan.frontmatter.title);

	ctx.ui.notify(`📄 Converting plan to PRD as '${featureSlug}'...`, "info");

	pi.sendUserMessage(
		`Convert this plan to a PRD. Load .agents/skills/plan-to-prd/SKILL.md and follow its workflow.\n\n` +
			`Use this exact feature name: ${featureSlug}.\n` +
			`Create artifacts under dev/work/plans/${featureSlug}/ (do not derive a different slug).\n\n` +
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
		updatePlanFrontmatter(state.currentSlug, { status: "planned" });
	}

	if (plan.frontmatter.status === "complete") {
		ctx.ui.notify("This plan is already complete.", "info");
		return;
	}

	// Guard: plan already in "building" — check if execution finished
	if (plan.frontmatter.status === "building") {
		const isComplete = checkPrdExecutionComplete(state.currentSlug, plan.frontmatter.has_prd);
		if (isComplete) {
			updatePlanFrontmatter(state.currentSlug, {
				status: "complete",
				completed: new Date().toISOString(),
			});
			state.executionMode = false;
			ctx.ui.notify("This plan's build already completed. Marked as complete.", "info");
			return;
		}
		// Still in progress — confirm re-trigger
		const proceed = await ctx.ui.confirm(
			"Build Already In Progress",
			"This plan is already being built. Re-trigger execution?",
		);
		if (!proceed) return;
	}

	// Transition to building
	updatePlanFrontmatter(state.currentSlug, { status: "building" });

	// Auto-commit plan and artifacts before build begins
	commitPlanToGit(state.currentSlug);

	state.planModeEnabled = false;
	state.executionMode = true;

	ctx.ui.notify("⚡ Build started!", "info");

	if (plan.frontmatter.has_prd) {
		// Has PRD: invoke execute-prd skill
		const prdFeatureSlug = resolvePrdFeatureSlug(state.currentSlug);
		pi.sendUserMessage(
			`Execute the ${prdFeatureSlug} PRD. Load the execute-prd skill from .pi/skills/execute-prd/SKILL.md. ` +
				`The PRD is at dev/work/plans/${prdFeatureSlug}/prd.md and the task list is at dev/work/plans/${prdFeatureSlug}/prd.json. ` +
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
		prdPath: state.currentSlug ? `dev/work/plans/${resolvePrdFeatureSlug(state.currentSlug)}/prd.json` : "dev/autonomous/prd.json",
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
