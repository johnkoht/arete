/**
 * Command handlers for plan mode (simplified).
 *
 * Commands: /plan [new|list|open|save|rename|status|delete|archive], /approve, /review, /pre-mortem, /prd, /build
 *
 * Plan mode is a planning-only tool. No enforced workflow or mandatory gates.
 * Agent adapts behavior based on work type and plan size.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	savePlan,
	loadPlan,
	listPlans,
	updatePlanFrontmatter,
	loadPlanArtifact,
	slugify,
	listArchive,
	archivePlan,
	listBacklogItems,
	promoteBacklogItem,
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
import {
	checkMemoryEntry,
	checkMemoryIndex,
	checkPlanStatus,
	getChangedDirectories,
	checkCapabilityCatalog,
	hasUserFacingChanges,
	checkUpdatesModified,
} from "./wrap-checks.js";
import {
	getCurrentVersion,
	bumpVersion,
	getUnreleasedCommits,
	runPreflightChecks,
	executeRelease,
	getLatestTag,
	type BumpType,
} from "./release.js";

// ────────────────────────────────────────────────────────────
// Shared types for command handlers
// ────────────────────────────────────────────────────────────

/** Mutable extension state shared across commands (simplified) */
export interface PlanModeState {
	planModeEnabled: boolean;
	executionMode: boolean;
	currentSlug: string | null;
	planTitle: string | null;
	planSize: PlanSize | "unknown" | null;
	planText: string;
	todoItems: TodoItem[];
	preMortemRun: boolean;
	reviewRun: boolean;
	prdConverted: boolean;
	/** Whether the current plan was loaded from disk (true) or created fresh (false).
	 *  Auto-save is disabled for loaded plans to prevent accidental overwrites. */
	loadedFromDisk: boolean;
	/** Last assistant message text (for --capture flag in /plan save) */
	lastAssistantText: string | null;
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
		loadedFromDisk: false,
		lastAssistantText: null,
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
		case "close":
			await handlePlanClose(ctx, pi, state);
			break;
		case "list":
			await handlePlanList(subcommand.slice(1).join(" "), ctx, pi, state);
			break;
		case "open":
			await handlePlanOpen(subcommand[1], ctx, pi, state);
			break;
		case "save": {
			const saveArgs = subcommand.slice(1).join(" ");
			const hasCapture = saveArgs.includes("--capture");
			const slug = saveArgs.replace("--capture", "").trim() || undefined;
			await handlePlanSave(slug, ctx, pi, state, { 
				capture: hasCapture,
				lastAssistantText: hasCapture ? state.lastAssistantText ?? undefined : undefined
			});
			break;
		}
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
		case "promote":
			await handlePromote(subcommand.slice(1).join(" "), ctx, pi, state);
			break;
		default:
			ctx.ui.notify(
				`Unknown subcommand: ${cmd}. Available: new, list, open, save, rename, close, status, delete, archive, promote`,
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
	size: PlanSize | "unknown",
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
	state.loadedFromDisk = false; // Fresh plan: auto-save enabled

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

/**
 * Close the current plan and return to default mode.
 * Offers to save unsaved changes before closing.
 */
export async function handlePlanClose(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	// Check for unsaved changes before closing
	if (hasUnsavedPlanChanges(state)) {
		// If plan was loaded from disk, content may have been changed by a tangential
		// agent response — warn the user before saving. (Regression fix: plan-overwrite bug)
		const message = state.loadedFromDisk
			? "Plan content has changed since it was loaded. This may be from an unrelated " +
			  "agent response. Review carefully before saving."
			: "You have unsaved plan changes. Save before closing?";
		const shouldSave = await ctx.ui.confirm(
			"Unsaved plan changes",
			message,
		);
		if (shouldSave) {
			await handlePlanSave(undefined, ctx, pi, state);
		}
	}

	// Clear all plan state
	state.planModeEnabled = false;
	state.executionMode = false;
	state.currentSlug = null;
	state.planTitle = null;
	state.planText = "";
	state.planSize = null;
	state.todoItems = [];
	state.preMortemRun = false;
	state.reviewRun = false;
	state.prdConverted = false;
	state.loadedFromDisk = false;

	pi.appendEntry("plan-mode", {
		enabled: false,
		todos: [],
		executing: false,
		currentSlug: null,
		planSize: null,
		preMortemRun: false,
		reviewRun: false,
		prdConverted: false,
		loadedFromDisk: false,
	});

	ctx.ui.notify("Plan closed. Back to default mode.", "info");
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
	/** Status of the plan (used for grouping) */
	status: PlanStatus;
}

/** Result from preparePlanListItems */
export interface PlanListResult {
	items: PlanListItem[];
	backlogCount: number;
}

/** Filter type for plan list */
export type PlanListFilter = "work" | "backlog" | "complete" | "building" | "planned" | "archive" | "all";

/** Status group with header text and items */
export interface PlanStatusGroup {
	status: PlanStatus;
	headerText: string;
	items: PlanListItem[];
}

/** Parse filter flags from args string */
export function parsePlanListFilter(args: string): PlanListFilter {
	const trimmed = args.trim().toLowerCase();
	if (trimmed.includes("--backlog")) return "backlog";
	if (trimmed.includes("--complete")) return "complete";
	if (trimmed.includes("--building")) return "building";
	if (trimmed.includes("--planned")) return "planned";
	if (trimmed.includes("--archive")) return "archive";
	if (trimmed.includes("--all")) return "all";
	return "work"; // default: building + planned + recent complete (14 days)
}

/**
 * Format an ISO date string as a relative date for display.
 * Returns "today", "yesterday", "2d ago", "1w ago", "2w ago", or "Mar 15" for older dates.
 */
export function formatRelativeDate(isoString: string): string {
	if (!isoString) return "";

	const date = new Date(isoString);
	if (isNaN(date.getTime())) return "";

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "today";
	if (diffDays === 1) return "yesterday";
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 14) return "1w ago";
	if (diffDays < 21) return "2w ago";

	// Older dates: show "Mar 15" format
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Filter and sort plans, then build list items. Pure function for testability.
 * @param plans - Array of plan summaries
 * @param filter - Filter type (work, backlog, complete, building, planned, all)
 * @param cutoffDate - Date for 14-day filtering on "work" view (defaults to 14 days ago)
 */
export function preparePlanListItems(
	plans: Array<{ slug: string; frontmatter: PlanFrontmatter }>,
	filter: PlanListFilter,
	cutoffDate?: Date,
): PlanListResult {
	// Calculate backlog count (ideas + drafts)
	const backlogCount = plans.filter((p) =>
		p.frontmatter.status === "idea" || p.frontmatter.status === "draft"
	).length;

	// Default cutoff: 14 days ago
	const cutoff = cutoffDate ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

	let filtered = plans;

	switch (filter) {
		case "work":
			// building + planned + complete within 14 days
			filtered = plans.filter((p) => {
				const status = p.frontmatter.status;
				if (status === "building" || status === "planned") return true;
				if (status === "complete") {
					const updated = new Date(p.frontmatter.updated);
					return updated >= cutoff;
				}
				return false;
			});
			break;
		case "backlog":
			// ideas + drafts
			filtered = plans.filter((p) =>
				p.frontmatter.status === "idea" || p.frontmatter.status === "draft"
			);
			break;
		case "complete":
			filtered = plans.filter((p) => p.frontmatter.status === "complete");
			break;
		case "building":
			filtered = plans.filter((p) => p.frontmatter.status === "building");
			break;
		case "planned":
			filtered = plans.filter((p) => p.frontmatter.status === "planned");
			break;
		case "archive":
			// Show all archived plans (no filtering needed, listArchive() already returns them)
			break;
		case "all":
			// No filtering
			break;
	}

	const sorted = [...filtered].sort((a, b) => {
		const pa = STATUS_PRIORITY[a.frontmatter.status] ?? 5;
		const pb = STATUS_PRIORITY[b.frontmatter.status] ?? 5;
		return pa - pb;
	});

	const items = sorted.map((p) => {
		const emoji = STATUS_EMOJI[p.frontmatter.status] ?? "📄";
		const relativeDate = formatRelativeDate(p.frontmatter.updated);
		const sizeAndDate = [p.frontmatter.size, relativeDate].filter(Boolean).join(", ");
		return {
			value: p.slug,
			label: `${emoji} ${p.frontmatter.title}    ${sizeAndDate}`,
			description: `   ${p.slug}`,
			status: p.frontmatter.status,
		};
	});

	return { items, backlogCount };
}

/** Human-readable header text for each status */
const STATUS_HEADER_TEXT: Record<PlanStatus, string> = {
	building: "⚡ BUILDING",
	planned: "✅ PLANNED",
	draft: "📝 DRAFTS",
	idea: "💡 IDEAS",
	complete: "🎉 COMPLETE",
	abandoned: "🚫 ABANDONED",
};

/**
 * Group plan list items by their status.
 * Preserves order within each group (already sorted by status priority from preparePlanListItems).
 */
export function groupPlansByStatus(items: PlanListItem[]): PlanStatusGroup[] {
	const groups: Map<PlanStatus, PlanListItem[]> = new Map();
	
	for (const item of items) {
		const existing = groups.get(item.status);
		if (existing) {
			existing.push(item);
		} else {
			groups.set(item.status, [item]);
		}
	}
	
	// Convert to array of groups, maintaining the order items came in (already sorted by priority)
	const result: PlanStatusGroup[] = [];
	const seenStatuses = new Set<PlanStatus>();
	
	for (const item of items) {
		if (!seenStatuses.has(item.status)) {
			seenStatuses.add(item.status);
			result.push({
				status: item.status,
				headerText: STATUS_HEADER_TEXT[item.status] ?? item.status.toUpperCase(),
				items: groups.get(item.status) ?? [],
			});
		}
	}
	
	return result;
}

/**
 * Format a plan item as a table row with aligned columns.
 * Returns [row1, row2] where row1 is title+size+date and row2 is the slug.
 */
export function formatPlanTableRow(
	item: PlanListItem,
	maxTitleWidth = 24,
	maxSizeWidth = 8,
): { row1: string; row2: string } {
	const emoji = STATUS_EMOJI[item.status] ?? "📄";
	
	// Extract title from label (after emoji)
	// Label format: "emoji title    size, date"
	const labelParts = item.label.split("    ");
	const titleWithEmoji = labelParts[0] ?? item.label;
	const title = titleWithEmoji.replace(/^[^\s]+\s*/, ""); // Remove emoji
	const sizeAndDate = labelParts[1] ?? "";
	
	// Parse size and date from sizeAndDate
	const [size, date] = sizeAndDate.split(", ").map(s => s?.trim() ?? "");
	
	// Pad title and size for alignment
	const paddedTitle = title.slice(0, maxTitleWidth).padEnd(maxTitleWidth);
	const paddedSize = (size ?? "").slice(0, maxSizeWidth).padEnd(maxSizeWidth);
	const dateStr = date ?? "";
	
	// Row 1: emoji + title + size + date
	const row1 = `${emoji} ${paddedTitle} ${paddedSize} ${dateStr}`;
	// Row 2: indented slug (extract from description)
	const slug = item.description.trim();
	const row2 = `  ${slug}`;
	
	return { row1, row2 };
}

async function handlePlanList(args: string, ctx: CommandContext, pi: CommandPi, state: PlanModeState): Promise<void> {
	const filter = parsePlanListFilter(args);
	// Use listArchive() for archive filter, listPlans() otherwise
	const plans = filter === "archive" ? listArchive() : listPlans();
	const { items, backlogCount } = preparePlanListItems(plans, filter);

	if (items.length === 0) {
		ctx.ui.notify("No plans found in dev/work/plans/", "info");
		return;
	}

	let selectedSlug: string | null = null;

	// Map filter to header text
	const headerTextMap: Record<PlanListFilter, string> = {
		work: "Active Plans",
		backlog: "Backlog (ideas & drafts)",
		complete: "Completed Plans",
		building: "Building Plans",
		planned: "Planned Plans",
		archive: "Archived Plans",
		all: "All Plans",
	};

	// Group items by status for section headers
	const groups = groupPlansByStatus(items);

	// Build table-formatted items with section headers
	const tableItems: Array<{ value: string; label: string; description: string; isHeader?: boolean }> = [];
	for (const group of groups) {
		// Add section header (non-selectable, marked with special value)
		tableItems.push({
			value: `__header__${group.status}`,
			label: `── ${group.headerText} ──`,
			description: "",
			isHeader: true,
		});
		// Add items in this group with table formatting
		for (const item of group.items) {
			const { row1, row2 } = formatPlanTableRow(item);
			tableItems.push({
				value: item.value,
				label: row1,
				description: row2,
			});
		}
	}

	// Footer text for work view
	const footerText = filter === "work" && backlogCount > 0
		? `Showing active plans. Use --backlog to see ${backlogCount} idea${backlogCount === 1 ? "" : "s"}/draft${backlogCount === 1 ? "" : "s"}.`
		: "";

	// Try rich UI if available
	if (ctx.hasUI && ctx.ui.custom) {
		// @ts-ignore - Runtime dependency, types not available at compile time
		const { Container, SelectList, Text } = await import("@mariozechner/pi-tui");
		// @ts-ignore - Runtime dependency, types not available at compile time
		const { DynamicBorder } = await import("@mariozechner/pi-coding-agent");

		selectedSlug = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const typedTheme = theme as {
				fg(color: string, text: string): string;
				bold(text: string): string;
			};

			const container = new Container();
			container.addChild(new DynamicBorder((str: string) => typedTheme.fg("accent", str)));

			// Header
			container.addChild(new Text(typedTheme.fg("accent", typedTheme.bold(headerTextMap[filter]))));

			// SelectList with table items
			const selectList = new SelectList(tableItems, Math.min(tableItems.length, 15), {
				selectedPrefix: (text: string) => typedTheme.fg("accent", text),
				selectedText: (text: string) => typedTheme.fg("accent", text),
				description: (text: string) => typedTheme.fg("muted", text),
				scrollInfo: (text: string) => typedTheme.fg("dim", text),
				noMatch: (text: string) => typedTheme.fg("warning", text),
			});

			selectList.onSelect = (item: { value: string; isHeader?: boolean }) => {
				// Skip header items
				if (item.value.startsWith("__header__")) {
					return;
				}
				done(item.value);
			};
			selectList.onCancel = () => done(null);

			container.addChild(selectList);

			// Footer with backlog count (for work view)
			if (footerText) {
				container.addChild(new Text(typedTheme.fg("muted", footerText)));
			}

			// Navigation hint
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
		// Fallback: simple select (filter out headers)
		const selectableItems = tableItems.filter((item) => !item.value.startsWith("__header__"));
		const options = selectableItems.map((item) => item.label);
		const selected = await ctx.ui.select("Plans", options);
		if (selected) {
			const index = options.indexOf(selected);
			if (index >= 0) {
				selectedSlug = selectableItems[index].value;
			}
		}
		// Show footer notification for fallback UI
		if (footerText) {
			ctx.ui.notify(footerText, "info");
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
	state.loadedFromDisk = true; // Disable auto-save for loaded plans

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
	options?: { capture?: boolean; lastAssistantText?: string },
): Promise<void> {
	// If --capture flag is set and we have new content from conversation, use it
	if (options?.capture && options?.lastAssistantText) {
		const extracted = extractTodoItems(options.lastAssistantText);
		if (extracted.length > 0) {
			state.planText = options.lastAssistantText;
			state.todoItems = extracted;
			state.planSize = classifyPlanSize(extracted, options.lastAssistantText);
			state.loadedFromDisk = false; // Now it's fresh content
			ctx.ui.notify("📝 Captured latest plan from conversation", "info");
		} else {
			ctx.ui.notify("No plan steps found in latest response. Save cancelled.", "warning");
			return;
		}
	}

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

	// Guard: if plan was loaded from disk, check for unexpected content changes.
	// This catches cases where agent_end previously overwrote state.planText
	// (e.g. from a tangential response with numbered steps). (Regression fix: plan-overwrite bug)
	if (state.loadedFromDisk && slug) {
		const diskPlan = loadPlan(slug);
		if (diskPlan && diskPlan.content.trim() !== state.planText.trim()) {
			const proceed = await ctx.ui.confirm(
				"Plan content changed",
				"The plan content differs from what's on disk. This may be from an " +
				"unrelated agent response. Save anyway? This will overwrite the original.",
			);
			if (!proceed) {
				ctx.ui.notify("Save cancelled. Use /plan open to reload the original.", "info");
				return;
			}
		}
	}

	const now = new Date().toISOString();
	const existingPlan = loadPlan(slug);

	const frontmatter: PlanFrontmatter = existingPlan
		? { 
			...existingPlan.frontmatter, 
			updated: now, 
			steps: state.todoItems.length,
			// Update size if we have a classified size (not null/unknown)
			size: (state.planSize && state.planSize !== "unknown") ? state.planSize : existingPlan.frontmatter.size,
		}
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
		loadedFromDisk: state.loadedFromDisk,
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
		loadedFromDisk: state.loadedFromDisk,
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
		state.todoItems = [];
		state.preMortemRun = false;
		state.reviewRun = false;
		state.prdConverted = false;
		state.loadedFromDisk = false;
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
			const finalSlug = archivePlan(slug, archiveStatus);
			const now = new Date();
			const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
			ctx.ui.notify(`📁 Archived to dev/work/archive/${yearMonth}/${finalSlug}/`, "info");

			if (state.currentSlug === slug) {
				state.currentSlug = null;
				state.planText = "";
				state.planSize = null;
				state.todoItems = [];
				state.preMortemRun = false;
				state.reviewRun = false;
				state.prdConverted = false;
				state.loadedFromDisk = false;
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
		const finalSlug = archivePlan(state.currentSlug, archiveStatus);
		const now = new Date();
		const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		ctx.ui.notify(`📁 Archived to dev/work/archive/${yearMonth}/${finalSlug}/`, "info");

		state.currentSlug = null;
		state.planText = "";
		state.planSize = null;
		state.todoItems = [];
		state.preMortemRun = false;
		state.reviewRun = false;
		state.prdConverted = false;
		state.loadedFromDisk = false;
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
// /plan promote command handler
// ────────────────────────────────────────────────────────────

/**
 * Handle /plan promote <slug> command.
 * Promotes a backlog item to a plan with proper frontmatter.
 * If no slug provided, shows a list of backlog items to select from.
 */
export async function handlePromote(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	const slugArg = args.trim();

	let slugToPromote: string | undefined;

	if (slugArg) {
		// Direct slug provided
		slugToPromote = slugArg;
	} else {
		// Show backlog list for selection
		const backlogItems = listBacklogItems();
		
		if (backlogItems.length === 0) {
			ctx.ui.notify("No backlog items found in dev/work/backlog/", "info");
			return;
		}

		const options = backlogItems.map((item) => `💡 ${item.title} (${item.relativePath})`);
		const selected = await ctx.ui.select("Select backlog item to promote", options);
		
		if (!selected) {
			ctx.ui.notify("Promote cancelled.", "info");
			return;
		}

		// Extract the relative path from the selection
		const idx = options.indexOf(selected);
		if (idx >= 0) {
			slugToPromote = backlogItems[idx].relativePath;
		}
	}

	if (!slugToPromote) {
		ctx.ui.notify("No backlog item selected.", "warning");
		return;
	}

	// Promote the backlog item
	const newSlug = promoteBacklogItem(slugToPromote);

	if (!newSlug) {
		ctx.ui.notify(`Backlog item not found: ${slugToPromote}`, "error");
		return;
	}

	ctx.ui.notify(`🚀 Promoted '${slugToPromote}' → dev/work/plans/${newSlug}/plan.md (status: draft)`, "info");

	// Open the newly created plan
	const plan = loadPlan(newSlug);
	if (plan) {
		state.currentSlug = newSlug;
		state.planTitle = plan.frontmatter.title;
		state.planText = plan.content;
		state.planSize = plan.frontmatter.size;
		state.preMortemRun = false;
		state.reviewRun = false;
		state.prdConverted = false;
		state.todoItems = extractTodoItems(plan.content);
		state.planModeEnabled = true;
		state.executionMode = false;
		state.loadedFromDisk = true;

		pi.appendEntry("plan-mode", {
			enabled: state.planModeEnabled,
			todos: state.todoItems,
			executing: state.executionMode,
			currentSlug: state.currentSlug,
			planSize: state.planSize,
			loadedFromDisk: state.loadedFromDisk,
		});
	}
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
		loadedFromDisk: state.loadedFromDisk,
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
		`Review this plan using the review-plan skill. Load .pi/skills/review-plan/SKILL.md and follow its workflow.\n\n` +
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
		`Run a pre-mortem risk analysis on this plan. Load .pi/skills/run-pre-mortem/SKILL.md and follow its workflow.\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	state.preMortemRun = true;
	updatePlanFrontmatter(state.currentSlug, { has_pre_mortem: true });
}

// ────────────────────────────────────────────────────────────
// /wrap command handler
// ────────────────────────────────────────────────────────────

/** Checklist tier — determines which items to show */
export type ChecklistTier = 1 | 2 | 3;

/** Code paths that trigger Tier 2 (code changes) */
const CODE_PATHS = ["packages/", ".pi/extensions/", ".pi/skills/", "src/"];

/** Keywords in PRD tasks that trigger Tier 3 (new capabilities) */
const CAPABILITY_KEYWORDS = ["command", "skill", "service", "cli", "tool"];

/** Minimal PRD task structure for tier detection */
interface PrdTask {
	title?: string;
	description?: string;
}

/** Minimal PRD structure for tier detection */
interface PrdJson {
	userStories?: PrdTask[];
}

/**
 * Detect which checklist tier applies based on plan context.
 *
 * - Tier 1: All plans (default)
 * - Tier 2: Code changes (changedDirs includes code paths)
 * - Tier 3: New capabilities (PRD tasks mention command/skill/service)
 */
export function detectChecklistTier(
	planDir: string,
	changedDirs: string[] | null,
	hasPrd: boolean,
): ChecklistTier {
	// Check for Tier 3: PRD with capability keywords
	if (hasPrd) {
		const prdJsonPath = join(planDir, "prd.json");
		if (existsSync(prdJsonPath)) {
			try {
				const content = readFileSync(prdJsonPath, "utf-8");
				const prd = JSON.parse(content) as PrdJson;
				const tasks = prd.userStories ?? [];

				// Check if any task mentions capability keywords
				for (const task of tasks) {
					const text = `${task.title ?? ""} ${task.description ?? ""}`.toLowerCase();
					if (CAPABILITY_KEYWORDS.some((kw) => text.includes(kw))) {
						return 3;
					}
				}
			} catch {
				// JSON parse failed — fall through to Tier 2 check
			}
		}
	}

	// Check for Tier 2: Code changes
	if (changedDirs && changedDirs.length > 0) {
		const hasCodeChanges = changedDirs.some((dir) =>
			CODE_PATHS.some((codePath) => dir.startsWith(codePath) || dir.includes(`/${codePath}`)),
		);
		if (hasCodeChanges) {
			return 2;
		}
	}

	// Default: Tier 1
	return 1;
}

/**
 * Find directories that have LEARNINGS.md files.
 * Used for Tier 2 suggested review items.
 */
export function findLearningsInDirs(changedDirs: string[] | null, cwd: string = process.cwd()): string[] {
	if (!changedDirs || changedDirs.length === 0) {
		return [];
	}

	const dirsWithLearnings: string[] = [];

	for (const dir of changedDirs) {
		const learningsPath = join(cwd, dir, "LEARNINGS.md");
		if (existsSync(learningsPath)) {
			dirsWithLearnings.push(dir);
		}
	}

	return dirsWithLearnings;
}

/**
 * Format the close-out checklist output based on detection results and tier.
 * Returns markdown string ready for sendUserMessage.
 */
export function formatCloseoutChecklist(
	planTitle: string,
	slug: string,
	tier: ChecklistTier,
	results: {
		hasMemoryEntry: boolean;
		hasMemoryIndex: boolean;
		planStatus: string | null;
		catalogDate: Date | null;
		changedDirs: string[] | null;
		dirsWithLearnings: string[];
		hasUserFacingChanges: boolean;
		updatesModified: boolean;
	},
): string {
	const lines: string[] = [];
	const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
	let needsAttention = 0;

	lines.push(`📋 **Close-out checklist for: ${planTitle}**`);
	lines.push("");

	// ─────────────────────────────────────────────────────────
	// Tier 1: Required for all plans
	// ─────────────────────────────────────────────────────────
	lines.push("**Tier 1 — Required for all plans:**");

	// Memory entry check
	if (results.hasMemoryEntry) {
		lines.push(`✅ Memory entry exists: memory/entries/*_${slug}*.md`);
	} else {
		needsAttention++;
		lines.push(`❌ Memory entry missing — Create memory entry at \`memory/entries/${today}_${slug}-learnings.md\``);
	}

	// Memory index check
	if (results.hasMemoryIndex) {
		lines.push(`✅ MEMORY.md index contains slug`);
	} else {
		needsAttention++;
		lines.push(`❌ MEMORY.md index missing slug — Add index line to \`memory/MEMORY.md\``);
	}

	// Plan status check
	if (results.planStatus === "building") {
		needsAttention++;
		lines.push(`❌ Plan status still "building" — Run \`/plan archive\` to mark complete or abandoned`);
	} else if (results.planStatus === "complete" || results.planStatus === "abandoned") {
		lines.push(`✅ Plan status: ${results.planStatus}`);
	} else {
		lines.push(`⚠️ Plan status: ${results.planStatus ?? "unknown"} — suggested review`);
	}

	// ─────────────────────────────────────────────────────────
	// Tier 2: Code changes
	// ─────────────────────────────────────────────────────────
	if (tier >= 2) {
		lines.push("");
		lines.push("**Tier 2 — Code changes:**");

		if (results.changedDirs === null) {
			lines.push("⚠️ Unable to determine changed directories — manual review needed");
		} else if (results.dirsWithLearnings.length > 0) {
			for (const dir of results.dirsWithLearnings) {
				lines.push(`⚠️ LEARNINGS.md suggested review in: \`${dir}/\``);
			}
		} else {
			lines.push("✅ No LEARNINGS.md files in changed directories");
		}

		// UPDATES.md check for user-facing changes
		if (results.hasUserFacingChanges) {
			if (results.updatesModified) {
				lines.push("✅ UPDATES.md was updated (user-facing changes detected)");
			} else {
				needsAttention++;
				lines.push("❌ UPDATES.md not updated — User-facing changes detected in packages/runtime/ or packages/apps/. Add release notes to `packages/runtime/UPDATES.md`");
			}
		}
	}

	// ─────────────────────────────────────────────────────────
	// Tier 3: New capabilities
	// ─────────────────────────────────────────────────────────
	if (tier >= 3) {
		lines.push("");
		lines.push("**Tier 3 — New capabilities:**");

		// Capability catalog freshness
		if (results.catalogDate) {
			const catalogDateStr = results.catalogDate.toISOString().split("T")[0];
			lines.push(`⚠️ Capability catalog last updated: ${catalogDateStr} — suggested review`);
		} else {
			lines.push("⚠️ Capability catalog not found — suggested review if new capabilities added");
		}

		// AGENTS.md freshness
		lines.push("⚠️ AGENTS.md — suggested review if CLI/skill changed");
	}

	// ─────────────────────────────────────────────────────────
	// Summary
	// ─────────────────────────────────────────────────────────
	lines.push("");
	if (needsAttention === 0) {
		lines.push("**Summary**: All required items complete! ✅");
	} else if (needsAttention === 1) {
		lines.push("**Summary**: 1 item needs attention.");
	} else {
		lines.push(`**Summary**: ${needsAttention} items need attention.`);
	}

	return lines.join("\n");
}

export async function handleWrap(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Use /plan open to load a plan first.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	ctx.ui.notify("📋 Starting close-out check...", "info");

	// Run detection checks
	const slug = state.currentSlug;
	const hasMemoryEntry = checkMemoryEntry(slug);
	const hasMemoryIndex = checkMemoryIndex(slug);
	const planStatus = checkPlanStatus(slug);
	const catalogDate = checkCapabilityCatalog();

	// Get changed directories since plan creation (or last 7 days if no date)
	const planCreated = plan.frontmatter.created
		? new Date(plan.frontmatter.created)
		: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const changedDirs = getChangedDirectories(planCreated);

	// Detect tier based on plan context
	const planDir = `dev/work/plans/${slug}`;
	const hasPrd = plan.frontmatter.has_prd;
	const tier = detectChecklistTier(planDir, changedDirs, hasPrd);

	// Find directories with LEARNINGS.md for Tier 2 suggested review
	const dirsWithLearnings = findLearningsInDirs(changedDirs);

	// Check for user-facing changes and UPDATES.md status
	const userFacingChanges = hasUserFacingChanges(changedDirs);
	const updatesModified = userFacingChanges ? checkUpdatesModified(planCreated) : false;

	// Format and send the tiered checklist output
	const checklistOutput = formatCloseoutChecklist(
		plan.frontmatter.title,
		slug,
		tier,
		{
			hasMemoryEntry,
			hasMemoryIndex,
			planStatus,
			catalogDate,
			changedDirs,
			dirsWithLearnings,
			hasUserFacingChanges: userFacingChanges,
			updatesModified,
		},
	);

	pi.sendUserMessage(checklistOutput);
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
		`Convert this plan to a PRD. Load .pi/skills/plan-to-prd/SKILL.md and follow its workflow.\n\n` +
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
	const trimmedArgs = args.trim();
	const subcommand = trimmedArgs.toLowerCase();

	if (subcommand === "status") {
		handleBuildStatus(ctx, state);
		return;
	}

	// Support /build <slug> without plan mode active
	let targetSlug = trimmedArgs || null;

	if (targetSlug) {
		// If plan mode active with different plan, warn about switching
		if (state.currentSlug && state.currentSlug !== targetSlug) {
			const confirmed = await ctx.ui.confirm(
				"Switch Plan",
				`Switch from "${state.currentSlug}" to "${targetSlug}"?`,
			);
			if (!confirmed) return;
		}
	} else {
		targetSlug = state.currentSlug;
	}

	if (!targetSlug) {
		ctx.ui.notify("No plan specified. Use /build <slug> or open a plan first.", "error");
		return;
	}

	const plan = loadPlan(targetSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${targetSlug}`, "error");
		return;
	}

	// Update state with target slug for execution
	state.currentSlug = targetSlug;

	// Build gate: require planned status
	if (plan.frontmatter.status === "idea" || plan.frontmatter.status === "draft") {
		ctx.ui.notify(
			`⛔ Plan status is '${plan.frontmatter.status}'. Run /approve first.`,
			"error",
		);
		return;
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

	ctx.ui.notify("📦 Status → building", "info");

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
		preMortemRun: state.preMortemRun,
		reviewRun: state.reviewRun,
		prdConverted: state.prdConverted,
		loadedFromDisk: state.loadedFromDisk,
	});
}

// ────────────────────────────────────────────────────────────
// /ship command handler
// ────────────────────────────────────────────────────────────

export async function handleShip(
	args: string,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	// Support /ship <slug> without plan mode active
	let targetSlug = args.trim() || null;

	if (targetSlug) {
		// If plan mode active with different plan, warn about switching
		if (state.currentSlug && state.currentSlug !== targetSlug) {
			const confirmed = await ctx.ui.confirm(
				"Switch Plan",
				`Switch from "${state.currentSlug}" to "${targetSlug}"?`,
			);
			if (!confirmed) return;
		}
	} else {
		targetSlug = state.currentSlug;
	}

	if (!targetSlug) {
		ctx.ui.notify("No plan specified. Use /ship <slug> or open a plan first.", "error");
		return;
	}

	const plan = loadPlan(targetSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${targetSlug}`, "error");
		return;
	}

	// Update state with target slug for execution
	state.currentSlug = targetSlug;

	// Check plan status
	if (plan.frontmatter.status === "complete") {
		ctx.ui.notify("This plan is already complete.", "info");
		return;
	}

	if (plan.frontmatter.status === "building") {
		ctx.ui.notify("This plan is already being built. Use /build status to check progress.", "info");
		return;
	}

	// Ship gate: require planned status
	if (plan.frontmatter.status === "idea" || plan.frontmatter.status === "draft") {
		ctx.ui.notify(
			`⛔ Plan status is '${plan.frontmatter.status}'. Run /approve first.`,
			"error",
		);
		return;
	}

	// Transition to building — match handleBuild pattern
	updatePlanFrontmatter(state.currentSlug, { status: "building" });

	// Enable execution mode for completion detection
	state.planModeEnabled = false;
	state.executionMode = true;

	// Notify user (status transition)
	ctx.ui.notify("📦 Status → building", "info");

	// Persist state for session resume (LEARNINGS.md: state persistence fields must stay in sync)
	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		todos: state.todoItems,
		executing: state.executionMode,
		currentSlug: state.currentSlug,
		planSize: state.planSize,
		preMortemRun: state.preMortemRun,
		reviewRun: state.reviewRun,
		prdConverted: state.prdConverted,
		loadedFromDisk: state.loadedFromDisk,
	});

	// Invoke the ship skill
	pi.sendUserMessage(
		`Ship this plan. Load .pi/skills/ship/SKILL.md and follow its workflow.\n\n` +
			`Plan: ${plan.frontmatter.title}\n` +
			`Slug: ${state.currentSlug}\n` +
			`Size: ${plan.frontmatter.size}\n` +
			`Steps: ${plan.frontmatter.steps}\n` +
			`Has PRD: ${plan.frontmatter.has_prd ? "yes" : "no"}\n` +
			`Has Pre-mortem: ${plan.frontmatter.has_pre_mortem ? "yes" : "no"}\n` +
			`Has Review: ${plan.frontmatter.has_review ? "yes" : "no"}\n\n` +
			plan.content,
	);
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

// ────────────────────────────────────────────────────────────
// /release command handler
// ────────────────────────────────────────────────────────────

/**
 * Handle /release command for semantic versioning.
 *
 * Subcommands:
 * - status: Show current version and unreleased commits
 * - patch [--dry-run]: Bump patch version (0.x.Y → 0.x.Y+1)
 * - minor [--dry-run]: Bump minor version (0.X.y → 0.X+1.0)
 */
export async function handleRelease(
	args: string,
	ctx: CommandContext,
	_pi: CommandPi,
): Promise<void> {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const subcommand = parts[0]?.toLowerCase();
	const flags = parts.slice(1);
	const isDryRun = flags.includes("--dry-run");

	if (!subcommand || subcommand === "status") {
		await handleReleaseStatus(ctx);
		return;
	}

	if (subcommand === "patch" || subcommand === "minor") {
		await handleReleaseBump(subcommand as BumpType, isDryRun, ctx);
		return;
	}

	ctx.ui.notify(
		`Unknown subcommand: ${subcommand}. Usage: /release [status|patch|minor] [--dry-run]`,
		"warning",
	);
}

/**
 * Show current version and unreleased commits.
 */
async function handleReleaseStatus(ctx: CommandContext): Promise<void> {
	try {
		const version = getCurrentVersion();
		const lastTag = getLatestTag();
		const commits = getUnreleasedCommits();

		const lines: string[] = [];
		lines.push(`📦 **Current Version**: ${version}`);
		
		if (lastTag) {
			lines.push(`🏷️ **Latest Tag**: ${lastTag}`);
		} else {
			lines.push(`🏷️ **Latest Tag**: (none)`);
		}

		lines.push("");
		
		if (commits.length === 0) {
			lines.push("✅ No unreleased commits.");
		} else {
			lines.push(`📝 **Unreleased Commits** (${commits.length}):`);
			const maxShow = 15;
			const toShow = commits.slice(0, maxShow);
			for (const commit of toShow) {
				lines.push(`  • ${commit.hash} ${commit.subject}`);
			}
			if (commits.length > maxShow) {
				lines.push(`  ... and ${commits.length - maxShow} more`);
			}
		}

		lines.push("");
		lines.push("**Commands**:");
		lines.push("  /release patch         Bump patch version (0.x.Y → 0.x.Y+1)");
		lines.push("  /release minor         Bump minor version (0.X.y → 0.X+1.0)");
		lines.push("  /release patch --dry-run   Preview what would happen");

		ctx.ui.notify(lines.join("\n"), "info");
	} catch (err) {
		ctx.ui.notify(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}

/**
 * Execute a version bump (or dry-run).
 */
async function handleReleaseBump(
	type: BumpType,
	dryRun: boolean,
	ctx: CommandContext,
): Promise<void> {
	try {
		// Run preflight checks first (even in dry-run, show warnings)
		const preflight = runPreflightChecks();
		
		if (!preflight.ok && !dryRun) {
			const errors = preflight.errors.map((e) => `  ❌ ${e}`).join("\n");
			ctx.ui.notify(`⛔ Release blocked:\n${errors}`, "error");
			return;
		}

		// Show preflight warnings in dry-run
		if (!preflight.ok && dryRun) {
			const warnings = preflight.errors.map((e) => `  ⚠️ ${e}`).join("\n");
			ctx.ui.notify(`Preflight warnings (would block release):\n${warnings}`, "warning");
		}

		// Execute (or simulate) the release
		const result = executeRelease(type, { dryRun });

		if (dryRun) {
			const lines: string[] = [];
			lines.push("🔍 **Dry Run Preview**");
			lines.push("");
			lines.push(`Version: ${result.oldVersion} → ${result.newVersion}`);
			lines.push(`Commits to include: ${result.commits.length}`);
			lines.push("");
			lines.push("**Changelog Entry**:");
			lines.push("```");
			lines.push(result.changelogEntry.trim());
			lines.push("```");
			lines.push("");
			lines.push("Run without --dry-run to execute the release.");
			ctx.ui.notify(lines.join("\n"), "info");
		} else {
			const lines: string[] = [];
			lines.push(`🚀 **Released v${result.newVersion}**`);
			lines.push("");
			lines.push(`Version: ${result.oldVersion} → ${result.newVersion}`);
			lines.push(`Commits included: ${result.commits.length}`);
			lines.push(`Tag: v${result.newVersion}`);
			lines.push("");
			lines.push("Files updated:");
			lines.push("  • package.json");
			lines.push("  • CHANGELOG.md");
			lines.push("");
			lines.push("Next steps:");
			lines.push("  git push origin main --tags");
			ctx.ui.notify(lines.join("\n"), "info");
		}
	} catch (err) {
		ctx.ui.notify(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}
