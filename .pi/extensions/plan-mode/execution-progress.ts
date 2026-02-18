import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TodoItem } from "./utils.js";

export type ExecutionRole = "PM" | "EM" | "Reviewer" | "Agent";
export type ExecutionProgressSource = "prd" | "todo";

export interface ExecutionTaskProgress {
	id: string;
	title: string;
	status: string;
	index: number;
}

export interface ExecutionProgressSnapshot {
	source: ExecutionProgressSource;
	total: number;
	completed: number;
	currentTask: ExecutionTaskProgress | null;
	tasks: ExecutionTaskProgress[];
}

interface PrdUserStory {
	id: string;
	title: string;
	status: string;
}

interface PrdFile {
	userStories: PrdUserStory[];
}

export function deriveActiveRole(activeCommand: string | null): ExecutionRole {
	switch (activeCommand) {
		case "plan":
		case "prd":
			return "PM";
		case "pre-mortem":
		case "build":
			return "EM";
		case "review":
			return "Reviewer";
		default:
			return "Agent";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizePrdUserStory(value: unknown, index: number): PrdUserStory | null {
	if (!isRecord(value)) return null;

	const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `task-${index + 1}`;
	const title =
		typeof value.title === "string" && value.title.trim()
			? value.title.trim()
			: `Task ${index + 1}`;
	const status =
		typeof value.status === "string" && value.status.trim()
			? value.status.trim().toLowerCase()
			: "pending";

	return { id, title, status };
}

export function parsePrdFile(content: string): PrdFile | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return null;
	}

	if (!isRecord(parsed)) return null;
	const userStories = parsed.userStories;
	if (!Array.isArray(userStories)) return null;

	const normalized = userStories
		.map((story, index) => normalizePrdUserStory(story, index))
		.filter((story): story is PrdUserStory => story !== null);

	if (normalized.length === 0) return null;
	return { userStories: normalized };
}

export function computePrdProgress(prdFile: PrdFile): ExecutionProgressSnapshot {
	const tasks: ExecutionTaskProgress[] = prdFile.userStories.map((story, index) => ({
		id: story.id,
		title: story.title,
		status: story.status,
		index: index + 1,
	}));

	const completed = tasks.filter((task) => task.status === "complete").length;
	const currentTask =
		tasks.find((task) => task.status === "in_progress") ??
		tasks.find((task) => task.status === "pending") ??
		null;

	return {
		source: "prd",
		total: tasks.length,
		completed,
		currentTask,
		tasks,
	};
}

export function readPrdProgress(prdPath = "dev/autonomous/prd.json"): ExecutionProgressSnapshot | null {
	try {
		const absolutePath = resolve(process.cwd(), prdPath);
		const content = readFileSync(absolutePath, "utf-8");
		const parsed = parsePrdFile(content);
		if (!parsed) return null;
		return computePrdProgress(parsed);
	} catch {
		return null;
	}
}

export function computeTodoProgress(todoItems: TodoItem[]): ExecutionProgressSnapshot {
	const tasks: ExecutionTaskProgress[] = todoItems.map((item) => ({
		id: String(item.step),
		title: item.text,
		status: item.completed ? "complete" : "pending",
		index: item.step,
	}));

	const completed = tasks.filter((task) => task.status === "complete").length;
	const currentTask = tasks.find((task) => task.status === "pending") ?? null;

	return {
		source: "todo",
		total: tasks.length,
		completed,
		currentTask,
		tasks,
	};
}

export function resolveExecutionProgress(
	params: {
		hasPrd: boolean;
		todoItems: TodoItem[];
		prdPath?: string;
	},
	readPrdProgressFn: (prdPath?: string) => ExecutionProgressSnapshot | null = readPrdProgress,
): ExecutionProgressSnapshot {
	if (params.hasPrd) {
		const prdProgress = readPrdProgressFn(params.prdPath);
		if (prdProgress) return prdProgress;
	}

	return computeTodoProgress(params.todoItems);
}

export function truncateTaskTitle(title: string, maxLength = 48): string {
	if (maxLength < 4 || title.length <= maxLength) return title;
	return `${title.slice(0, maxLength - 1)}…`;
}

export function formatCompactExecutionStatus(
	role: ExecutionRole,
	progress: ExecutionProgressSnapshot,
	maxTaskLength = 48,
): string {
	const currentTaskText = progress.currentTask
		? `#${progress.currentTask.index} ${truncateTaskTitle(progress.currentTask.title, maxTaskLength)}`
		: "—";
	const statusText = progress.currentTask?.status ?? (progress.total > 0 && progress.completed === progress.total ? "complete" : "pending");

	return `Role: ${role} · PRD: ${progress.completed}/${progress.total} complete · Current: ${currentTaskText} · Status: ${statusText}`;
}
