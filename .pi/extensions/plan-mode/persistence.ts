/**
 * Plan persistence module.
 *
 * File I/O for plan storage: save/load plans with YAML frontmatter,
 * manage artifacts (review, pre-mortem, PRD), list and delete plans.
 *
 * No external dependencies — uses node:fs and node:path only.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Valid plan lifecycle statuses */
export type PlanStatus =
	| "draft"
	| "planned"
	| "reviewed"
	| "approved"
	| "in-progress"
	| "completed"
	| "blocked"
	| "on-hold";

/** Plan size classification */
export type PlanSize = "tiny" | "small" | "medium" | "large";

/** YAML frontmatter for a plan.md file */
export interface PlanFrontmatter {
	title: string;
	slug: string;
	status: PlanStatus;
	size: PlanSize;
	created: string;
	updated: string;
	completed: string | null;
	blocked_reason: string | null;
	previous_status: PlanStatus | null;
	has_review: boolean;
	has_pre_mortem: boolean;
	has_prd: boolean;
	backlog_ref: string | null;
	steps: number;
}

/** Result from loading a plan */
export interface LoadedPlan {
	frontmatter: PlanFrontmatter;
	content: string;
}

/** Summary of a plan (for listing) */
export interface PlanSummary {
	slug: string;
	frontmatter: PlanFrontmatter;
}

// Default base directory for plans (relative to cwd)
const DEFAULT_PLANS_DIR = "dev/plans";

/**
 * Convert a title to a kebab-case slug.
 */
export function slugify(title: string): string {
	return title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "") // strip special chars
		.replace(/\s+/g, "-") // spaces to hyphens
		.replace(/-+/g, "-") // collapse multiple hyphens
		.replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * Serialize a PlanFrontmatter object to a YAML frontmatter string.
 */
export function serializeFrontmatter(fm: PlanFrontmatter): string {
	const lines: string[] = ["---"];

	for (const [key, value] of Object.entries(fm)) {
		if (value === null) {
			lines.push(`${key}: null`);
		} else if (typeof value === "boolean") {
			lines.push(`${key}: ${value}`);
		} else if (typeof value === "number") {
			lines.push(`${key}: ${value}`);
		} else {
			lines.push(`${key}: ${value}`);
		}
	}

	lines.push("---");
	return lines.join("\n");
}

/**
 * Parse a YAML frontmatter string into a PlanFrontmatter object.
 * Expects flat key-value pairs only.
 */
export function parseFrontmatter(raw: string): PlanFrontmatter {
	const fm: Record<string, string | number | boolean | null> = {};

	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed === "---") continue;

		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) continue;

		const key = trimmed.slice(0, colonIndex).trim();
		const rawValue = trimmed.slice(colonIndex + 1).trim();

		if (rawValue === "null") {
			fm[key] = null;
		} else if (rawValue === "true") {
			fm[key] = true;
		} else if (rawValue === "false") {
			fm[key] = false;
		} else if (/^\d+$/.test(rawValue)) {
			fm[key] = Number(rawValue);
		} else {
			fm[key] = rawValue;
		}
	}

	return fm as unknown as PlanFrontmatter;
}

/**
 * Split a plan.md file into frontmatter string and content.
 * Returns null if the file doesn't have valid frontmatter delimiters.
 */
function splitFrontmatterAndContent(fileContent: string): { frontmatterRaw: string; content: string } | null {
	if (!fileContent.startsWith("---")) return null;

	const secondDelimiter = fileContent.indexOf("\n---", 3);
	if (secondDelimiter === -1) return null;

	const frontmatterRaw = fileContent.slice(0, secondDelimiter + 4); // include closing ---
	const content = fileContent.slice(secondDelimiter + 4).replace(/^\n+/, ""); // trim leading newlines after ---

	return { frontmatterRaw, content };
}

/**
 * Resolve the plans directory path.
 */
function resolvePlansDir(basePath?: string): string {
	return basePath ?? DEFAULT_PLANS_DIR;
}

/**
 * Save a plan to dev/plans/{slug}/plan.md.
 * Creates the directory if it doesn't exist.
 */
export function savePlan(slug: string, frontmatter: PlanFrontmatter, content: string, basePath?: string): void {
	const plansDir = resolvePlansDir(basePath);
	const planDir = join(plansDir, slug);

	if (!existsSync(planDir)) {
		mkdirSync(planDir, { recursive: true });
	}

	const fm = serializeFrontmatter(frontmatter);
	const fileContent = `${fm}\n\n${content}`;
	writeFileSync(join(planDir, "plan.md"), fileContent, "utf-8");
}

/**
 * Load a plan from dev/plans/{slug}/plan.md.
 * Returns null if the plan doesn't exist or can't be parsed.
 */
export function loadPlan(slug: string, basePath?: string): LoadedPlan | null {
	const plansDir = resolvePlansDir(basePath);
	const filePath = join(plansDir, slug, "plan.md");

	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const parts = splitFrontmatterAndContent(raw);
		if (!parts) return null;

		const frontmatter = parseFrontmatter(parts.frontmatterRaw);
		return { frontmatter, content: parts.content };
	} catch {
		return null;
	}
}

/**
 * List all plans, sorted by updated date (most recent first).
 * Returns an empty array if no plans exist.
 */
export function listPlans(basePath?: string): PlanSummary[] {
	const plansDir = resolvePlansDir(basePath);

	if (!existsSync(plansDir)) return [];

	try {
		const entries = readdirSync(plansDir, { withFileTypes: true });
		const plans: PlanSummary[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const planFile = join(plansDir, entry.name, "plan.md");
			if (!existsSync(planFile)) continue;

			try {
				const raw = readFileSync(planFile, "utf-8");
				const parts = splitFrontmatterAndContent(raw);
				if (!parts) continue;

				const frontmatter = parseFrontmatter(parts.frontmatterRaw);
				plans.push({ slug: entry.name, frontmatter });
			} catch {
				// Skip plans that can't be parsed
			}
		}

		// Sort by updated date, most recent first
		plans.sort((a, b) => {
			const dateA = a.frontmatter.updated || "";
			const dateB = b.frontmatter.updated || "";
			return dateB.localeCompare(dateA);
		});

		return plans;
	} catch {
		return [];
	}
}

/**
 * Update a plan's frontmatter with partial updates.
 * Sets `updated` timestamp automatically.
 * Returns the updated frontmatter, or null if the plan doesn't exist.
 */
export function updatePlanFrontmatter(
	slug: string,
	updates: Partial<PlanFrontmatter>,
	basePath?: string,
): PlanFrontmatter | null {
	const plan = loadPlan(slug, basePath);
	if (!plan) return null;

	const updatedFrontmatter: PlanFrontmatter = {
		...plan.frontmatter,
		...updates,
		updated: new Date().toISOString(),
	};

	savePlan(slug, updatedFrontmatter, plan.content, basePath);
	return updatedFrontmatter;
}

/**
 * Save a plan artifact (review.md, pre-mortem.md, prd.md, etc.) to the plan's directory.
 */
export function savePlanArtifact(slug: string, filename: string, content: string, basePath?: string): void {
	const plansDir = resolvePlansDir(basePath);
	const planDir = join(plansDir, slug);

	if (!existsSync(planDir)) {
		mkdirSync(planDir, { recursive: true });
	}

	writeFileSync(join(planDir, filename), content, "utf-8");
}

/**
 * Load a plan artifact. Returns content string or null if not found.
 */
export function loadPlanArtifact(slug: string, filename: string, basePath?: string): string | null {
	const plansDir = resolvePlansDir(basePath);
	const filePath = join(plansDir, slug, filename);

	if (!existsSync(filePath)) return null;

	try {
		return readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Delete a plan and its entire directory.
 * Handles non-existent plans gracefully (no-op).
 */
export function deletePlan(slug: string, basePath?: string): void {
	const plansDir = resolvePlansDir(basePath);
	const planDir = join(plansDir, slug);

	if (!existsSync(planDir)) return;

	try {
		rmSync(planDir, { recursive: true, force: true });
	} catch {
		// Graceful failure
	}
}
