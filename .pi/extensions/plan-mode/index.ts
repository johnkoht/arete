/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe code analysis with full
 * plan lifecycle management: persistence, gates, and execution.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle plan mode
 * - Bash restricted to allowlisted read-only commands
 * - Extracts numbered plan steps from "Plan:" sections
 * - [DONE:n] markers to complete steps during execution
 * - Plan persistence to dev/plans/{slug}/plan.md
 * - Lifecycle gates: /review, /pre-mortem, /prd, /build
 * - Smart gate orchestration via /plan next
 * - Product Manager agent injection in plan mode
 * - Lifecycle status widget
 *
 * Adapted for Arete: pre-mortem, PRD gateway, quality gates.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Key } from "@mariozechner/pi-tui";
import {
	extractTodoItems,
	isSafeCommand,
	markCompletedSteps,
	classifyPlanSize,
	getMenuOptions,
	getPostExecutionMenuOptions,
	type TodoItem,
} from "./utils.js";
import {
	handlePlan,
	handleReview,
	handlePreMortem,
	handlePrd,
	handleBuild,
	type PlanModeState,
	createDefaultState,
} from "./commands.js";
import { loadPlan, savePlanArtifact, updatePlanFrontmatter } from "./persistence.js";
import { loadAgentConfig, getAgentModel, getAgentPrompt } from "./agents.js";
import { renderFooterStatus, renderLifecycleWidget, type WidgetState } from "./widget.js";

// Tools
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

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

	// Track whether save_plan_artifact tool is currently active
	let artifactToolActive = false;

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	// ── Helpers ────────────────────────────────────────────

	function getWidgetState(): WidgetState {
		const plan = state.currentSlug ? loadPlan(state.currentSlug) : null;
		return {
			planModeEnabled: state.planModeEnabled,
			planSize: state.planSize,
			status: plan?.frontmatter.status ?? null,
			has_review: state.reviewRun,
			has_pre_mortem: state.preMortemRun,
			has_prd: state.prdConverted,
			executionMode: state.executionMode,
			todosCompleted: state.todoItems.filter((t) => t.completed).length,
			todosTotal: state.todoItems.length,
		};
	}

	function updateStatus(ctx: ExtensionContext): void {
		const widgetState = getWidgetState();

		// Footer status
		const footerText = renderFooterStatus(widgetState, ctx.ui.theme);
		ctx.ui.setStatus("plan-mode", footerText);

		// Widget showing todo list (during execution) or lifecycle pipeline
		if (state.executionMode && state.todoItems.length > 0) {
			const lines = state.todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else if (state.planModeEnabled && state.planSize) {
			// Show lifecycle pipeline during plan mode with an active plan
			const pipelineLines = renderLifecycleWidget(widgetState, ctx.ui.theme);
			ctx.ui.setWidget("plan-todos", pipelineLines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		state.planModeEnabled = !state.planModeEnabled;
		state.executionMode = false;
		state.todoItems = [];

		if (state.planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
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
	 * Enable artifact tool during gate phases (review, pre-mortem, prd).
	 * Adds save_plan_artifact to active tools.
	 */
	function enableArtifactTool(): void {
		if (artifactToolActive) return;
		const currentTools = pi.getActiveTools();
		pi.setActiveTools([...currentTools, "save_plan_artifact"]);
		artifactToolActive = true;
	}

	/**
	 * Disable artifact tool after gate phase completes.
	 */
	function disableArtifactTool(): void {
		if (!artifactToolActive) return;
		const currentTools = pi.getActiveTools();
		pi.setActiveTools(currentTools.filter((t) => t !== "save_plan_artifact"));
		artifactToolActive = false;
	}

	// ── Tool Registration ──────────────────────────────────

	pi.registerTool({
		name: "save_plan_artifact",
		label: "Save Plan Artifact",
		description:
			"Save a plan artifact (review, pre-mortem, PRD, notes) to the current plan's directory. Only available during plan lifecycle gates.",
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
						text: `Saved artifact to dev/plans/${state.currentSlug}/${params.filename}`,
					},
				],
				isError: false,
			};
		},
	});

	// ── Command Registration ───────────────────────────────

	pi.registerCommand("plan", {
		description: "Plan mode — toggle or subcommands: new, list, open, save, status, next, hold, block, resume, delete",
		handler: async (args, ctx) => {
			await handlePlan(args, ctx, pi, state, () => togglePlanMode(ctx));
			updateStatus(ctx);
		},
	});

	pi.registerCommand("review", {
		description: "Run cross-model review on the current plan",
		handler: async (args, ctx) => {
			enableArtifactTool();
			await handleReview(args, ctx, pi, state);
			updateStatus(ctx);
		},
	});

	pi.registerCommand("pre-mortem", {
		description: "Run pre-mortem analysis on the current plan",
		handler: async (args, ctx) => {
			enableArtifactTool();
			await handlePreMortem(args, ctx, pi, state);
			updateStatus(ctx);
		},
	});

	pi.registerCommand("prd", {
		description: "Convert the current plan to a PRD",
		handler: async (args, ctx) => {
			enableArtifactTool();
			await handlePrd(args, ctx, pi, state);
			updateStatus(ctx);
		},
	});

	pi.registerCommand("build", {
		description: "Start building the approved plan, or check build status",
		handler: async (args, ctx) => {
			disableArtifactTool();
			await handleBuild(args, ctx, pi, state);
			updateStatus(ctx);
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
		if (!isSafeCommand(command)) {
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
				if (msg.customType === "plan-agent-context") return false;
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
			// Try to inject PM agent prompt
			const pmPrompt = getAgentPrompt("product-manager");
			const agentContext = pmPrompt
				? `\n\n## Product Manager Context\n\n${pmPrompt}`
				: "";

			// If there's an active plan, include its content
			let planContext = "";
			if (state.currentSlug) {
				const plan = loadPlan(state.currentSlug);
				if (plan) {
					planContext = `\n\n## Active Plan: ${plan.frontmatter.title}\n\nStatus: ${plan.frontmatter.status} | Size: ${plan.frontmatter.size}\n\n${plan.content}`;
				}
			}

			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls, questionnaire
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands (includes npm run typecheck, npm test)

Ask clarifying questions using the questionnaire tool.
Use brave-search skill via bash for web research.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.

**Arete workflow** (execution path decision tree):
- **Tiny** (1-2 simple steps): Direct execution, quality gates ✓, skip pre-mortem
- **Small** (2-3 moderate steps): Ask "Run pre-mortem first?" — use /skill:run-pre-mortem for risk analysis. Quality gates ✓. Offer "Capture learnings?" at end
- **Medium/Large** (3+ steps or complex): If plan has 3+ steps, suggest converting to PRD via /skill:plan-to-prd for autonomous execution. Otherwise apply pre-mortem + quality gates + memory capture${agentContext}${planContext}`,
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

**Quality gates**: Run \`npm run typecheck && npm test\` after completing implementation steps. If Python touched, also run \`npm run test:py\`.
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

	// Handle plan completion and plan mode UI
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

				// Update plan status if we have one
				if (state.currentSlug) {
					updatePlanFrontmatter(state.currentSlug, {
						status: "completed",
						completed: new Date().toISOString(),
					});
				}

				// Show post-execution menu
				if (ctx.hasUI) {
					const postOptions = getPostExecutionMenuOptions(state.postMortemRun);
					const choice = await ctx.ui.select("Plan complete — what next?", postOptions);

					if (choice === "Run post-mortem (extract learnings)") {
						state.postMortemRun = true;
						pi.sendUserMessage(
							"Run a post-mortem on the completed plan. Load .agents/skills/prd-post-mortem/SKILL.md and follow its workflow.",
						);
					} else if (choice === "Capture learnings to memory") {
						pi.sendUserMessage(
							"Capture learnings from this completed plan to memory/entries/. Include what worked well, what didn't, and recommendations for next time.",
						);
					}
					// "Done" — just clean up
				}

				state.executionMode = false;
				state.todoItems = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				disableArtifactTool();
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!state.planModeEnabled || !ctx.hasUI) return;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const text = getTextContent(lastAssistant);
			const extracted = extractTodoItems(text);
			if (extracted.length > 0) {
				state.todoItems = extracted;
				state.planText = text;
				state.planSize = classifyPlanSize(extracted, text);
			}
		}

		// Show plan steps and smart menu
		if (state.todoItems.length > 0) {
			const todoListText = state.todoItems
				.map((t, i) => `${i + 1}. ☐ ${t.text}`)
				.join("\n");
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**Plan Steps (${state.todoItems.length}, ${state.planSize}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);

			// Show smart menu based on plan size and gates
			const menuOptions = getMenuOptions({
				planSize: state.planSize ?? "small",
				preMortemRun: state.preMortemRun,
				reviewRun: state.reviewRun,
				prdConverted: state.prdConverted,
				postMortemRun: state.postMortemRun,
			});

			const choice = await ctx.ui.select("Plan mode - what next?", menuOptions);

			if (choice?.startsWith("Execute") || choice?.includes("Execute")) {
				state.planModeEnabled = false;
				state.executionMode = state.todoItems.length > 0;
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateStatus(ctx);

				const execMessage =
					state.todoItems.length > 0
						? `Execute the plan. Start with: ${state.todoItems[0].text}`
						: "Execute the plan you just created.";
				pi.sendMessage(
					{ customType: "plan-mode-execute", content: execMessage, display: true },
					{ triggerTurn: true },
				);
			} else if (choice === "Run pre-mortem, then execute") {
				enableArtifactTool();
				// Auto-save plan first
				if (!state.currentSlug) {
					const titleMatch = state.planText.match(/^#\s+(.+)/m);
					const title = titleMatch ? titleMatch[1].trim() : "auto-plan";
					const { slugify } = await import("./persistence.js");
					state.currentSlug = slugify(title);
				}
				await handlePreMortem("", ctx, pi, state);
			} else if (choice === "Review the plan") {
				enableArtifactTool();
				if (!state.currentSlug) {
					const titleMatch = state.planText.match(/^#\s+(.+)/m);
					const title = titleMatch ? titleMatch[1].trim() : "auto-plan";
					const { slugify } = await import("./persistence.js");
					state.currentSlug = slugify(title);
				}
				await handleReview("", ctx, pi, state);
			} else if (choice?.startsWith("Convert to PRD")) {
				enableArtifactTool();
				if (!state.currentSlug) {
					const titleMatch = state.planText.match(/^#\s+(.+)/m);
					const title = titleMatch ? titleMatch[1].trim() : "auto-plan";
					const { slugify } = await import("./persistence.js");
					state.currentSlug = slugify(title);
				}
				await handlePrd("", ctx, pi, state);
			} else if (choice === "Save as draft") {
				const { handlePlan: handlePlanCmd } = await import("./commands.js");
				await handlePlanCmd("save", ctx, pi, state, () => togglePlanMode(ctx));
			} else if (choice === "Refine the plan") {
				const refinement = await ctx.ui.editor("Refine the plan:", "");
				if (refinement?.trim()) {
					pi.sendUserMessage(refinement.trim());
				}
			}

			updateStatus(ctx);
		} else {
			// No plan extracted — show simple menu
			const choice = await ctx.ui.select("Plan mode - what next?", [
				"Execute the plan",
				"Stay in plan mode",
				"Refine the plan",
			]);

			if (choice?.startsWith("Execute")) {
				state.planModeEnabled = false;
				state.executionMode = false;
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateStatus(ctx);
				pi.sendMessage(
					{ customType: "plan-mode-execute", content: "Execute the plan you just created.", display: true },
					{ triggerTurn: true },
				);
			} else if (choice === "Refine the plan") {
				const refinement = await ctx.ui.editor("Refine the plan:", "");
				if (refinement?.trim()) {
					pi.sendUserMessage(refinement.trim());
				}
			}
		}

		persistState();
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
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

		// On resume: re-scan messages to rebuild completion state
		const isResume = planModeEntry !== undefined;
		if (isResume && state.executionMode && state.todoItems.length > 0) {
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

		if (state.planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
