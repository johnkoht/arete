/**
 * Plan Mode Extension (Simplified)
 *
 * A planning-only tool for safe code exploration.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle plan mode
 * - Bash restricted to an allowlist of safe commands
 * - Extracts numbered plan steps from "Plan:" sections
 * - Auto-saves plans when agent produces them
 * - Optional: /pre-mortem, /review, /prd
 * - /approve to mark ready, /build to execute
 * - [DONE:n] markers to track progress during execution
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Key } from "@mariozechner/pi-tui";
import {
	extractTodoItems,
	isAllowedInPlanMode,
	markCompletedSteps,
	classifyPlanSize,
	suggestPlanName,
	PLAN_MODE_TOOLS,
	type TodoItem,
} from "./utils.js";
import {
	handlePlan,
	handleApprove,
	handleReview,
	handlePreMortem,
	handlePrd,
	handleBuild,
	handlePlanSave,
	type PlanModeState,
	createDefaultState,
} from "./commands.js";
import { loadPlan, savePlanArtifact, slugify, updatePlanFrontmatter, type PlanSize } from "./persistence.js";
import { getAgentPrompt } from "./agents.js";
import { renderFooterStatus, renderTodoWidget, type WidgetState } from "./widget.js";

// Tools — captured at startup so we restore ALL tools (including extension-registered ones like subagent)
let NORMAL_MODE_TOOLS: string[] = ["read", "bash", "edit", "write"];

// Allowed artifact filenames for the save tool
const ALLOWED_ARTIFACTS = ["review.md", "pre-mortem.md", "prd.md", "notes.md"];

// Type guard for assistant messages
function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

// Extract text content from an assistant message
function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
	// ── State ──────────────────────────────────────────────
	const state: PlanModeState = createDefaultState();

	// Track auto-save state
	let lastAutoSavedContent = "";
	let inPrdConversion = false;

	pi.registerFlag("plan", {
		description: "Start in plan mode (safe exploration)",
		type: "boolean",
		default: false,
	});

	// ── Helpers ────────────────────────────────────────────

	function getWidgetState(): WidgetState {
		const plan = state.currentSlug ? loadPlan(state.currentSlug) : null;

		return {
			planModeEnabled: state.planModeEnabled,
			executionMode: state.executionMode,
			planId: plan?.frontmatter.slug ?? state.currentSlug,
			status: plan?.frontmatter.status ?? null,
			planSize: state.planSize,
			todosCompleted: state.todoItems.filter((t) => t.completed).length,
			todosTotal: state.todoItems.length,
			hasPreMortem: state.preMortemRun,
			hasReview: state.reviewRun,
			hasPrd: state.prdConverted,
		};
	}

	function updateStatus(ctx: ExtensionContext): void {
		const widgetState = getWidgetState();

		// Footer status
		const footerText = renderFooterStatus(widgetState, ctx.ui.theme);
		ctx.ui.setStatus("plan-mode", footerText);

		// Todo widget during execution
		if (state.executionMode && state.todoItems.length > 0) {
			const lines = renderTodoWidget(state.todoItems, ctx.ui.theme);
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		state.planModeEnabled = !state.planModeEnabled;
		state.executionMode = false;

		if (state.planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`📋 Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: state.planModeEnabled,
			todos: state.todoItems,
			executing: state.executionMode,
			currentSlug: state.currentSlug,
			planSize: state.planSize,
			preMortemRun: state.preMortemRun,
			reviewRun: state.reviewRun,
			prdConverted: state.prdConverted,
		});
	}

	/**
	 * Auto-save plan when agent produces numbered steps.
	 * Only saves if: 2+ steps extracted AND content materially changed.
	 */
	async function autoSavePlan(ctx: ExtensionContext): Promise<void> {
		if (!state.planModeEnabled) return;
		if (state.todoItems.length < 2) return;
		if (!state.planText.trim()) return;

		// Check if content materially changed
		const contentHash = state.planText.slice(0, 500);
		if (contentHash === lastAutoSavedContent) return;

		// If no slug yet, infer one
		if (!state.currentSlug) {
			const suggestedName = suggestPlanName(state.planText, state.todoItems);
			state.currentSlug = slugify(suggestedName);
		}

		// Save the plan
		await handlePlanSave(state.currentSlug, ctx, pi, state);
		lastAutoSavedContent = contentHash;

		ctx.ui.notify(
			`💾 Auto-saved as '${state.currentSlug}' — rename with /plan rename <name>`,
			"info",
		);
	}

	// ── Tool Registration ──────────────────────────────────

	pi.registerTool({
		name: "save_plan_artifact",
		label: "Save Plan Artifact",
		description:
			"Save a plan artifact (review, pre-mortem, PRD, notes) to the current plan's directory.",
		parameters: Type.Object({
			filename: Type.String({
				description: `Artifact filename. Must be one of: ${ALLOWED_ARTIFACTS.join(", ")}`,
			}),
			content: Type.String({ description: "Content to save" }),
		}),
		execute: async (_toolCallId, params) => {
			if (!state.currentSlug) {
				return {
					content: [{ type: "text", text: "Error: No active plan. Use /plan save first." }],
					isError: true,
				};
			}

			if (!ALLOWED_ARTIFACTS.includes(params.filename)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: Invalid filename '${params.filename}'. Must be one of: ${ALLOWED_ARTIFACTS.join(", ")}`,
						},
					],
					isError: true,
				};
			}

			if (!params.content.trim()) {
				return {
					content: [{ type: "text", text: "Error: Content must be non-empty." }],
					isError: true,
				};
			}

			savePlanArtifact(state.currentSlug, params.filename, params.content);

			// Update frontmatter based on artifact type
			if (params.filename === "review.md") {
				updatePlanFrontmatter(state.currentSlug, { has_review: true });
				state.reviewRun = true;
			} else if (params.filename === "pre-mortem.md") {
				updatePlanFrontmatter(state.currentSlug, { has_pre_mortem: true });
				state.preMortemRun = true;
			} else if (params.filename === "prd.md") {
				updatePlanFrontmatter(state.currentSlug, { has_prd: true });
				state.prdConverted = true;
			}

			return {
				content: [
					{
						type: "text",
						text: `Saved artifact to dev/work/plans/${state.currentSlug}/${params.filename}`,
					},
				],
				isError: false,
			};
		},
	});

	// ── Command Registration ───────────────────────────────

	pi.registerCommand("plan", {
		description: "Plan mode — toggle or subcommands: new, list, open, save, rename, status, delete, backlog, shelve, archive",
		handler: async (args, ctx) => {
			await handlePlan(args, ctx, pi, state, () => togglePlanMode(ctx));
			updateStatus(ctx);
		},
	});

	pi.registerCommand("approve", {
		description: "Mark the current plan as ready to build",
		handler: async (_args, ctx) => {
			await handleApprove(ctx, pi, state);
			updateStatus(ctx);
			persistState();
		},
	});

	pi.registerCommand("review", {
		description: "Run cross-model review on the current plan",
		handler: async (args, ctx) => {
			await handleReview(args, ctx, pi, state);
			updateStatus(ctx);
			persistState();
		},
	});

	pi.registerCommand("pre-mortem", {
		description: "Run pre-mortem analysis on the current plan",
		handler: async (args, ctx) => {
			await handlePreMortem(args, ctx, pi, state);
			updateStatus(ctx);
			persistState();
		},
	});

	pi.registerCommand("prd", {
		description: "Convert the current plan to a PRD",
		handler: async (args, ctx) => {
			inPrdConversion = true;
			// PRD conversion writes files, so temporarily allow normal tools
			pi.setActiveTools([...NORMAL_MODE_TOOLS, "save_plan_artifact"]);
			await handlePrd(args, ctx, pi, state);
			inPrdConversion = false;
			if (state.planModeEnabled) {
				pi.setActiveTools(PLAN_MODE_TOOLS);
			}
			updateStatus(ctx);
			persistState();
		},
	});

	pi.registerCommand("build", {
		description: "Start building the ready plan, or check build status", 
		handler: async (args, ctx) => {
			await handleBuild(args, ctx, pi, state);
			updateStatus(ctx);
			persistState();
		},
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (state.todoItems.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}
			const list = state.todoItems
				.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`)
				.join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// ── Event Handlers ─────────────────────────────────────

	// Block destructive bash commands in plan mode
	pi.on("tool_call", async (event) => {
		if (!state.planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isAllowedInPlanMode(command, inPrdConversion)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	// Filter out stale plan mode context when not in plan mode
	pi.on("context", async (event) => {
		if (state.planModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.customType === "plan-execution-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	// Inject plan/execution context before agent starts
	pi.on("before_agent_start", async () => {
		if (state.planModeEnabled) {
			const baseContext = `[PLAN MODE ACTIVE]
You are in plan mode - a safe exploration mode for planning and controlled edits.

## Restrictions
- You can use: read, bash, grep, find, ls, questionnaire, edit, write
- Bash is restricted to an allowlist of safe commands (dangerous bash commands are blocked)

## Your Role
Help the user explore ideas and create clear, actionable plans.

Ask clarifying questions to understand:
- What problem are we solving?
- Who experiences this problem?
- What does success look like?

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.

## Recommendations by Plan Size
- **Tiny** (1-2 steps): Can execute directly
- **Small** (2-3 steps): Consider /pre-mortem for risk analysis
- **Medium** (3-5 steps): Recommend /pre-mortem, consider /prd for autonomous execution
- **Large** (6+ steps): Strongly recommend /pre-mortem and /review before building`;

			// Get the PM agent prompt
			const pmPrompt = getAgentPrompt("product-manager");
			const agentContext = pmPrompt ? `\n\n## Product Manager Guidance\n\n${pmPrompt}` : "";

			// Include active plan content if available
			let planContext = "";
			if (state.currentSlug) {
				const plan = loadPlan(state.currentSlug);
				if (plan) {
					const artifacts: string[] = [];
					if (plan.frontmatter.has_pre_mortem) artifacts.push("pre-mortem ✓");
					if (plan.frontmatter.has_review) artifacts.push("review ✓");
					if (plan.frontmatter.has_prd) artifacts.push("PRD ✓");
					const artifactsStr = artifacts.length > 0 ? `\nArtifacts: ${artifacts.join(", ")}` : "";

					planContext = `\n\n## Active Plan: ${plan.frontmatter.title}

Status: ${plan.frontmatter.status} | Size: ${plan.frontmatter.size}${artifactsStr}

${plan.content}`;
				}
			}

			return {
				message: {
					customType: "plan-mode-context",
					content: `${baseContext}${agentContext}${planContext}`,
					display: false,
				},
			};
		}

		if (state.executionMode && state.todoItems.length > 0) {
			const remaining = state.todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.

**Quality gates**: Run \`npm run typecheck && npm test\` after completing implementation steps.
**After completing all steps**: Offer to capture learnings in \`memory/entries/\`.`,
					display: false,
				},
			};
		}
	});

	// Track progress after each turn
	pi.on("turn_end", async (event, ctx) => {
		if (!state.executionMode || state.todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, state.todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// Handle plan extraction and completion
	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (state.executionMode && state.todoItems.length > 0) {
			if (state.todoItems.every((t) => t.completed)) {
				const completedList = state.todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: `**Plan Complete!** ✓\n\n${completedList}`,
						display: true,
					},
					{ triggerTurn: false },
				);

				// Update plan status
				if (state.currentSlug) {
					updatePlanFrontmatter(state.currentSlug, {
						status: "complete",
						completed: new Date().toISOString(),
					});
				}

				// Offer post-completion options
				if (ctx.hasUI) {
					const choice = await ctx.ui.select("Plan complete — what next?", [
						"Capture learnings to memory",
						"Done",
					]);

					if (choice === "Capture learnings to memory") {
						pi.sendUserMessage(
							"Capture learnings from this completed plan to memory/entries/. Include what worked well, what didn't, and recommendations for next time.",
						);
					}
				}

				state.executionMode = false;
				state.todoItems = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		// In plan mode: extract todos and auto-save
		if (!state.planModeEnabled) return;

		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const text = getTextContent(lastAssistant);
			const extracted = extractTodoItems(text);
			if (extracted.length > 0) {
				state.todoItems = extracted;
				state.planText = text;
				state.planSize = classifyPlanSize(extracted, text);

				// Auto-save the plan
				await autoSavePlan(ctx);
			}
		}

		updateStatus(ctx);
		persistState();
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		// Capture all available tools (built-in + extension-registered like subagent)
		// before we restrict them, so we can restore the full set when leaving plan mode
		const allTools = pi.getAllTools();
		if (allTools.length > 0) {
			NORMAL_MODE_TOOLS = allTools.map((t: { name: string }) => t.name);
		}

		if (pi.getFlag("plan") === true) {
			state.planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore persisted state
		const planModeEntry = entries
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === "plan-mode",
			)
			.pop() as
			| {
					data?: {
						enabled: boolean;
						todos?: TodoItem[];
						executing?: boolean;
						currentSlug?: string | null;
						planSize?: PlanSize | null;
						preMortemRun?: boolean;
						reviewRun?: boolean;
						prdConverted?: boolean;
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			state.planModeEnabled = planModeEntry.data.enabled ?? state.planModeEnabled;
			state.todoItems = planModeEntry.data.todos ?? state.todoItems;
			state.executionMode = planModeEntry.data.executing ?? state.executionMode;
			state.currentSlug = planModeEntry.data.currentSlug ?? state.currentSlug;
			state.planSize = planModeEntry.data.planSize ?? state.planSize;
			state.preMortemRun = planModeEntry.data.preMortemRun ?? state.preMortemRun;
			state.reviewRun = planModeEntry.data.reviewRun ?? state.reviewRun;
			state.prdConverted = planModeEntry.data.prdConverted ?? state.prdConverted;
		}

		// Reconcile with persisted plan frontmatter
		if (state.currentSlug) {
			const persistedPlan = loadPlan(state.currentSlug);
			if (persistedPlan) {
				state.planText = persistedPlan.content;
				state.planSize = persistedPlan.frontmatter.size;
				state.todoItems = extractTodoItems(persistedPlan.content);
				state.preMortemRun = persistedPlan.frontmatter.has_pre_mortem;
				state.reviewRun = persistedPlan.frontmatter.has_review;
				state.prdConverted = persistedPlan.frontmatter.has_prd;

				// Resume execution if plan was building
				if (persistedPlan.frontmatter.status === "building") {
					state.executionMode = true;
					state.planModeEnabled = false;
				}
			}
		}

		// On resume: re-scan messages to rebuild completion state
		if (state.executionMode && state.todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (
					entry.type === "message" &&
					"message" in entry &&
					isAssistantMessage(entry.message as AgentMessage)
				) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, state.todoItems);
		}

		// Set tools based on mode
		if (state.executionMode) {
			state.planModeEnabled = false;
			pi.setActiveTools(NORMAL_MODE_TOOLS);
		} else if (state.planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}

		updateStatus(ctx);
	});
}
