/**
 * Command handlers for the plan lifecycle system.
 *
 * All /plan subcommands, /review, /pre-mortem, /prd, /build.
 * Each handler receives (args, ctx, pi, state) and operates on
 * the shared extension state.
 *
 * These handlers import from pure modules (persistence, lifecycle, utils)
 * and delegate to Pi's extension API for UI and messaging.
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
} from "./persistence.js";
import { canTransition, getMissingGates, isReadyToApprove } from "./lifecycle.js";
import {
	classifyPlanSize,
	extractTodoItems,
	type PlanSize,
	type TodoItem,
} from "./utils.js";
import { resolveExecutionProgress } from "./execution-progress.js";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];

// ────────────────────────────────────────────────────────────
// Phase type for linear pipeline flow
// ────────────────────────────────────────────────────────────

/** Pipeline phases for linear flow control */
export type Phase = "plan" | "prd" | "pre-mortem" | "review" | "build" | "done";

/** Infer lifecycle phase from persisted plan status and gate completion flags. */
export function inferPhaseFromPlan(
	status: PlanStatus,
	gates: { has_prd: boolean; has_pre_mortem: boolean; has_review: boolean },
): Phase {
	if (status === "completed") return "done";
	if (status === "in-progress" || status === "approved") return "build";
	if (gates.has_review) return "review";
	if (gates.has_pre_mortem) return "pre-mortem";
	if (gates.has_prd) return "prd";
	return "plan";
}
import { getTemplate, getTemplates, getTemplateOptions } from "./templates.js";

// ────────────────────────────────────────────────────────────
// Shared types for command handlers
// ────────────────────────────────────────────────────────────

/** Mutable extension state shared across commands */
export interface PlanModeState {
	// Existing
	planModeEnabled: boolean;
	executionMode: boolean;
	todoItems: TodoItem[];
	// Plan lifecycle
	currentSlug: string | null;
	planSize: PlanSize | null;
	planText: string;
	preMortemRun: boolean;
	reviewRun: boolean;
	prdConverted: boolean;
	postMortemRun: boolean;
	// Phase tracking (linear flow)
	currentPhase: Phase; // Where user is in linear flow (controls menus)
	activeCommand: string | null; // Which command is running (controls prompt injection)
	isRefining: boolean; // Refine loop guard to prevent menu recursion
}

/** Create a fresh default state */
export function createDefaultState(): PlanModeState {
	return {
		planModeEnabled: false,
		executionMode: false,
		todoItems: [],
		currentSlug: null,
		planSize: null,
		planText: "",
		preMortemRun: false,
		reviewRun: false,
		prdConverted: false,
		postMortemRun: false,
		currentPhase: "plan",
		activeCommand: null,
		isRefining: false,
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

// Normal and plan mode tool sets
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

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
			// Deduplicate
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
		// No args: toggle plan mode
		togglePlanMode();
		return;
	}

	switch (cmd) {
		case "new":
			await handlePlanNew(subcommand[1], ctx, pi, state, togglePlanMode);
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
		case "status":
			handlePlanStatus(ctx, state);
			break;
		case "next":
			await handlePlanNext(ctx, pi, state);
			break;
		case "hold":
			await handlePlanTransition(ctx, pi, state, "on-hold");
			break;
		case "block": {
			const reason = subcommand.slice(1).join(" ") || "No reason provided";
			await handlePlanBlock(ctx, pi, state, reason);
			break;
		}
		case "resume":
			await handlePlanResume(ctx, pi, state);
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
			ctx.ui.notify(`Unknown subcommand: ${cmd}. Available: new, list, open, save, status, next, hold, block, resume, delete`, "warning");
	}
}

async function handlePlanNew(
	templateSlug: string | undefined,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
	togglePlanMode: () => void,
): Promise<void> {
	let template;

	if (templateSlug) {
		// Direct template selection
		template = getTemplate(templateSlug);
		if (!template) {
			const available = getTemplates().map((t) => t.slug).join(", ");
			ctx.ui.notify(`Template not found: '${templateSlug}'. Available: ${available}`, "warning");
			return;
		}
	} else {
		// Interactive template picker
		const options = [
			...getTemplateOptions(),
			"Blank plan — start from scratch",
		];
		const choice = await ctx.ui.select("Choose a plan template:", options);
		if (!choice) return;

		if (choice.startsWith("Blank")) {
			// No template — just enable plan mode
			if (!state.planModeEnabled) togglePlanMode();
			ctx.ui.notify("📋 Plan mode enabled. Describe your idea and I'll help shape it into a plan.", "info");
			return;
		}

		// Find template by matching the option text
		const templates = getTemplates();
		const index = getTemplateOptions().indexOf(choice);
		if (index < 0 || index >= templates.length) return;
		template = templates[index];
	}

	// Apply template
	state.planText = template.content;
	state.todoItems = extractTodoItems(template.content);
	state.planSize = classifyPlanSize(state.todoItems, template.content);
	state.currentSlug = template.slug;

	// Enable plan mode if not already
	if (!state.planModeEnabled) togglePlanMode();

	// Show the template content and prompt for refinement
	pi.sendMessage(
		{
			customType: "plan-template",
			content: `📋 **Template: ${template.name}**\n\n${template.content}`,
			display: true,
		},
		{ triggerTurn: false },
	);

	ctx.ui.notify(
		`Template applied: ${template.name} (${state.todoItems.length} steps, ${state.planSize}). Refine it with your specific context.`,
		"info",
	);

	// Ask PM agent to help refine
	pi.sendUserMessage(
		`I've started with the "${template.name}" plan template. Help me refine it for my specific use case. ` +
			`Ask me clarifying questions about what I'm working on, then adapt the template steps to my context.`,
	);
}

async function handlePlanList(ctx: CommandContext, pi: CommandPi, state: PlanModeState): Promise<void> {
	const plans = listPlans();

	if (plans.length === 0) {
		ctx.ui.notify("No plans found in dev/plans/", "info");
		return;
	}

	const statusEmoji: Record<string, string> = {
		draft: "📝",
		planned: "📋",
		reviewed: "🔍",
		approved: "✅",
		"in-progress": "⚡",
		completed: "🎉",
		blocked: "🚫",
		"on-hold": "⏸",
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
	state.currentPhase = inferPhaseFromPlan(plan.frontmatter.status, {
		has_prd: plan.frontmatter.has_prd,
		has_pre_mortem: plan.frontmatter.has_pre_mortem,
		has_review: plan.frontmatter.has_review,
	});
	state.planModeEnabled = true;
	state.executionMode = false;
	state.activeCommand = null;
	state.isRefining = false;
	pi.setActiveTools(PLAN_MODE_TOOLS);

	ctx.ui.notify(
		`📋 Opened: ${plan.frontmatter.title} (${plan.frontmatter.status}, ${plan.frontmatter.size}) — phase: ${state.currentPhase}`,
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

async function handlePlanSave(
	providedSlug: string | undefined,
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.planText) {
		ctx.ui.notify("No plan to save. Create a plan first.", "warning");
		return;
	}

	// Derive slug from plan text title or use provided
	let slug = providedSlug ?? state.currentSlug;
	if (!slug) {
		// Try to extract title from first heading
		const titleMatch = state.planText.match(/^#\s+(.+)/m);
		const title = titleMatch ? titleMatch[1].trim() : "untitled-plan";
		slug = slugify(title);
	}

	const now = new Date().toISOString();
	const existingPlan = loadPlan(slug);

	const frontmatter: PlanFrontmatter = existingPlan
		? { ...existingPlan.frontmatter, updated: now }
		: {
				title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
				slug,
				status: "draft",
				size: state.planSize ?? "small",
				created: now,
				updated: now,
				completed: null,
				blocked_reason: null,
				previous_status: null,
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
		currentPhase: state.currentPhase,
		activeCommand: state.activeCommand,
		isRefining: state.isRefining,
	});

	ctx.ui.notify(`💾 Plan saved to dev/plans/${slug}/plan.md`, "info");
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
	const gates = {
		has_review: fm.has_review,
		has_pre_mortem: fm.has_pre_mortem,
		has_prd: fm.has_prd,
	};

	const missing = getMissingGates(fm.size, gates);
	const { ready } = isReadyToApprove(fm.size, gates);

	const lines = [
		`📋 **${fm.title}**`,
		`Status: ${fm.status} | Size: ${fm.size} | Steps: ${fm.steps}`,
		`Gates: PRD ${fm.has_prd ? "✓" : "☐"} | pre-mortem ${fm.has_pre_mortem ? "✓" : "☐"} | review ${fm.has_review ? "✓" : "☐"}`,
	];

	if (missing.length > 0) {
		const missingLabels = missing.map((g) => g.label).join(", ");
		lines.push(`Missing: ${missingLabels}`);
	}

	lines.push(ready ? "✅ Ready to approve" : "⏳ Not ready — mandatory gates incomplete");

	ctx.ui.notify(lines.join("\n"), "info");
}

// ────────────────────────────────────────────────────────────
// /plan next — smart gate orchestrator
// ────────────────────────────────────────────────────────────

export async function handlePlanNext(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan. Use /plan open <slug> or /plan save first.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) {
		ctx.ui.notify(`Plan not found: ${state.currentSlug}`, "error");
		return;
	}

	const fm = plan.frontmatter;
	const gates = {
		has_review: fm.has_review,
		has_pre_mortem: fm.has_pre_mortem,
		has_prd: fm.has_prd,
	};

	const missing = getMissingGates(fm.size, gates);
	const { ready, missing: requiredMissing } = isReadyToApprove(fm.size, gates);

	// Build gate checklist display
	const gateChecklist = [
		`${fm.has_prd ? "☑" : "☐"} PRD (${getGateLabel(fm.size, "prd")})`,
		`${fm.has_pre_mortem ? "☑" : "☐"} Pre-mortem (${getGateLabel(fm.size, "pre-mortem")})`,
		`${fm.has_review ? "☑" : "☐"} Cross-model review (${getGateLabel(fm.size, "review")})`,
	];

	const header = `📋 ${fm.title} (status: ${fm.status}, size: ${fm.size})\n\nGate checklist:\n${gateChecklist.map((g) => `  ${g}`).join("\n")}`;

	pi.sendMessage(
		{ customType: "plan-next-info", content: header, display: true },
		{ triggerTurn: false },
	);

	// Build options
	const options: string[] = [];

	if (missing.length > 0) {
		// Find next gate to run
		const nextGate = missing[0];
		options.push(`Run next gate (${nextGate.gate})`);
		if (missing.length > 1) {
			options.push("Run all remaining gates");
		}
	}

	if (ready) {
		options.push("✅ Approve (mark as ready to build)");
	} else if (requiredMissing.length === 0) {
		options.push("✅ Approve (mark as ready to build)");
	} else {
		options.push("Skip remaining → approve (override)");
	}
	options.push("Cancel");

	const choice = await ctx.ui.select("What next?", options);
	if (!choice || choice === "Cancel") return;

	if (choice.startsWith("Run next gate")) {
		const gate = missing[0];
		await runGate(gate.gate, ctx, pi, state);
	} else if (choice === "Run all remaining gates") {
		for (const gate of missing) {
			await runGate(gate.gate, ctx, pi, state);
		}
	} else if (choice.includes("Approve")) {
		await approvePlan(ctx, pi, state);
	} else if (choice.startsWith("Skip remaining")) {
		if (requiredMissing.length > 0) {
			const confirmed = await ctx.ui.confirm(
				"Override",
				`Mandatory gates are missing: ${requiredMissing.map((g) => g.gate).join(", ")}. Approve anyway?`,
			);
			if (!confirmed) return;
		}
		await approvePlan(ctx, pi, state);
	}
}

function getGateLabel(size: PlanSize, gate: string): string {
	const labels: Record<string, Record<string, string>> = {
		tiny: { review: "optional", "pre-mortem": "optional", prd: "skip" },
		small: { review: "optional", "pre-mortem": "optional", prd: "skip" },
		medium: { review: "optional", "pre-mortem": "recommended", prd: "optional" },
		large: { review: "recommended", "pre-mortem": "mandatory", prd: "mandatory" },
	};
	return labels[size]?.[gate] ?? "optional";
}

async function runGate(
	gate: "review" | "pre-mortem" | "prd",
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	switch (gate) {
		case "review":
			await handleReview("", ctx, pi, state);
			break;
		case "pre-mortem":
			await handlePreMortem("", ctx, pi, state);
			break;
		case "prd":
			await handlePrd("", ctx, pi, state);
			break;
	}
}

async function approvePlan(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) return;

	updatePlanFrontmatter(state.currentSlug, { status: "approved" });
	ctx.ui.notify(`✅ Plan approved! Run /build to start execution.`, "info");

	pi.appendEntry("plan-mode", {
		enabled: state.planModeEnabled,
		todos: state.todoItems,
		executing: state.executionMode,
		currentSlug: state.currentSlug,
		planSize: state.planSize,
		currentPhase: state.currentPhase,
		activeCommand: state.activeCommand,
		isRefining: state.isRefining,
	});
}

// ────────────────────────────────────────────────────────────
// Status transition helpers
// ────────────────────────────────────────────────────────────

async function handlePlanTransition(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
	targetStatus: PlanStatus,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) return;

	if (!canTransition(plan.frontmatter.status, targetStatus)) {
		ctx.ui.notify(`Cannot transition from ${plan.frontmatter.status} to ${targetStatus}`, "error");
		return;
	}

	updatePlanFrontmatter(state.currentSlug, {
		status: targetStatus,
		previous_status: plan.frontmatter.status,
	});

	ctx.ui.notify(`Plan status: ${targetStatus}`, "info");
}

async function handlePlanBlock(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
	reason: string,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) return;

	updatePlanFrontmatter(state.currentSlug, {
		status: "blocked",
		previous_status: plan.frontmatter.status,
		blocked_reason: reason,
	});

	ctx.ui.notify(`🚫 Plan blocked: ${reason}`, "info");
}

async function handlePlanResume(
	ctx: CommandContext,
	pi: CommandPi,
	state: PlanModeState,
): Promise<void> {
	if (!state.currentSlug) {
		ctx.ui.notify("No active plan.", "warning");
		return;
	}

	const plan = loadPlan(state.currentSlug);
	if (!plan) return;

	const previousStatus = plan.frontmatter.previous_status;
	if (!previousStatus) {
		ctx.ui.notify("No previous status to resume to.", "warning");
		return;
	}

	if (!canTransition(plan.frontmatter.status, previousStatus)) {
		ctx.ui.notify(`Cannot resume from ${plan.frontmatter.status} to ${previousStatus}`, "error");
		return;
	}

	updatePlanFrontmatter(state.currentSlug, {
		status: previousStatus,
		previous_status: null,
		blocked_reason: null,
	});

	ctx.ui.notify(`▶ Plan resumed: ${previousStatus}`, "info");
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
	state.activeCommand = "review";

	// Invoke review-plan skill with plan content
	pi.sendUserMessage(
		`Review this plan using the review-plan skill. Load .agents/skills/review-plan/SKILL.md and follow its workflow.\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	// Update state and frontmatter
	state.reviewRun = true;
	updatePlanFrontmatter(state.currentSlug, { has_review: true });

	// review.md is auto-saved from actual agent output in index.ts (agent_end).
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
	state.activeCommand = "pre-mortem";

	pi.sendUserMessage(
		`Run a pre-mortem risk analysis on this plan. Load .agents/skills/run-pre-mortem/SKILL.md and follow its workflow.\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	state.preMortemRun = true;
	updatePlanFrontmatter(state.currentSlug, { has_pre_mortem: true });

	// pre-mortem.md is auto-saved from actual agent output in index.ts (agent_end).
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
	state.activeCommand = "prd";

	pi.sendUserMessage(
		`Convert this plan to a PRD. Load .agents/skills/plan-to-prd/SKILL.md and follow its workflow.\n\n` +
			`Use this exact feature name: ${featureSlug}.\n` +
			`Create artifacts under dev/prds/${featureSlug}/ (do not derive a different slug).\n\n` +
			`Plan: ${plan.frontmatter.title}\nSize: ${plan.frontmatter.size}\nSteps: ${plan.frontmatter.steps}\n\n` +
			plan.content,
	);

	state.prdConverted = true;
	updatePlanFrontmatter(state.currentSlug, { has_prd: true });

	// prd.md is auto-saved from actual agent output in index.ts (agent_end).
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

	// Check if plan is approved
	if (plan.frontmatter.status !== "approved") {
		const override = await ctx.ui.confirm(
			"Plan Not Approved",
			`Plan status is '${plan.frontmatter.status}', not 'approved'. Start build anyway?`,
		);
		if (!override) return;
	}

	// Build gating
	const effectivePlanSize = state.planSize ?? plan.frontmatter.size;
	if (!state.preMortemRun && effectivePlanSize !== "tiny") {
		const skipPreMortem = await ctx.ui.confirm(
			"Pre-mortem missing",
			"Pre-mortem not completed. Skip?",
		);
		if (!skipPreMortem) return;
	}

	if (!state.reviewRun) {
		ctx.ui.notify("Review not completed. Proceeding.", "info");
	}

	// Transition to in-progress
	updatePlanFrontmatter(state.currentSlug, { status: "in-progress" });

	state.planModeEnabled = false;
	state.executionMode = true;
	pi.setActiveTools(NORMAL_MODE_TOOLS);

	ctx.ui.notify("⚡ Build started!", "info");
	state.activeCommand = "build";

	if (plan.frontmatter.has_prd) {
		// Has PRD: invoke execute-prd skill
		const prdFeatureSlug = resolvePrdFeatureSlug(state.currentSlug);
		pi.sendUserMessage(
			`Execute the ${prdFeatureSlug} PRD. Load the execute-prd skill from .pi/skills/execute-prd/SKILL.md. ` +
				`The PRD is at dev/prds/${prdFeatureSlug}/prd.md and the task list is at dev/autonomous/prd.json. ` +
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
		currentPhase: state.currentPhase,
		activeCommand: state.activeCommand,
		isRefining: state.isRefining,
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
		prdPath: "dev/autonomous/prd.json",
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
