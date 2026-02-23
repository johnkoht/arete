/**
 * Plan persistence module.
 *
 * File I/O for plan storage: save/load plans with YAML frontmatter,
 * manage artifacts (review, pre-mortem, PRD), list and delete plans.
 *
 * No external dependencies — uses node:fs and node:path only.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Valid plan lifecycle statuses */
export type PlanStatus = "idea" | "draft" | "planned" | "building" | "complete" | "abandoned";

/** Legacy status values for migration */
type LegacyPlanStatus =
	| "draft"
	| "planned"
	| "reviewed"
	| "approved"
	| "ready"
	| "in-progress"
	| "completed"
	| "blocked"
	| "on-hold"
	| "idea"
	| "building"
	| "complete"
	| "abandoned";

/** The set of valid current statuses */
const VALID_STATUSES = new Set<PlanStatus>(["idea", "draft", "planned", "building", "complete", "abandoned"]);

/**
 * Migrate legacy status values to current statuses.
 * Preserves backward compatibility with existing plans.
 * Returns the status as-is if it's already a valid simplified status.
 */
export function migrateStatus(status: string): PlanStatus {
	// If already a valid current status, return as-is
	if (VALID_STATUSES.has(status as PlanStatus)) {
		return status as PlanStatus;
	}

	const migrations: Record<LegacyPlanStatus, PlanStatus> = {
		idea: "idea",
		draft: "draft",
		planned: "planned",
		reviewed: "planned",
		approved: "planned",
		ready: "planned",
		"in-progress": "building",
		building: "building",
		completed: "complete",
		complete: "complete",
		abandoned: "abandoned",
		blocked: "draft",
		"on-hold": "draft",
	};
	return migrations[status as LegacyPlanStatus] ?? "draft";
}

/** Plan size classification */
export type PlanSize = "tiny" | "small" | "medium" | "large";

/** YAML frontmatter for a plan.md file */
export interface PlanFrontmatter {
	title: string;
	slug: string;
	status: PlanStatus;
	size: PlanSize | "unknown";
	tags: string[];
	created: string;
	updated: string;
	completed: string | null;
	execution: string | null;
	has_review: boolean;
	has_pre_mortem: boolean;
	has_prd: boolean;
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

// Default base directories for work items (relative to cwd)
export const DEFAULT_PLANS_DIR = "dev/work/plans";
// Internal constant — used by migrateBacklogToPlans
const DEFAULT_BACKLOG_DIR = "dev/work/backlog";
export const DEFAULT_ARCHIVE_DIR = "dev/work/archive";

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
		} else if (Array.isArray(value)) {
			lines.push(`${key}: [${value.join(", ")}]`);
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
 * Applies migrations for backward compatibility with legacy plans.
 * Supports flat key-value pairs and bracket-delimited arrays.
 */
export function parseFrontmatter(raw: string): PlanFrontmatter {
	const fm: Record<string, string | number | boolean | string[] | null> = {};

	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed === "---") continue;

		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) continue;

		const key = trimmed.slice(0, colonIndex).trim();
		const rawValue = trimmed.slice(colonIndex + 1).trim();

		// Skip removed legacy fields
		if (key === "previous_status" || key === "blocked_reason" || key === "backlog_ref") continue;

		if (rawValue === "null") {
			fm[key] = null;
		} else if (rawValue === "true") {
			fm[key] = true;
		} else if (rawValue === "false") {
			fm[key] = false;
		} else if (/^\[.*\]$/.test(rawValue)) {
			// Parse bracket-delimited arrays: [a, b, c] → ["a", "b", "c"]
			const inner = rawValue.slice(1, -1).trim();
			fm[key] = inner.length === 0 ? [] : inner.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
		} else if (/^\d+$/.test(rawValue)) {
			fm[key] = Number(rawValue);
		} else {
			fm[key] = rawValue;
		}
	}

	// Migrate legacy status values
	if (fm.status && typeof fm.status === "string") {
		fm.status = migrateStatus(fm.status);
	}

	// Ensure tags defaults to empty array
	if (!fm.tags || !Array.isArray(fm.tags)) {
		fm.tags = [];
	}

	return fm as unknown as PlanFrontmatter;
}

/**
 * Split a plan.md file into frontmatter string and content.
 * Returns null if the file doesn't have valid frontmatter delimiters.
 */
export function splitFrontmatterAndContent(fileContent: string): { frontmatterRaw: string; content: string } | null {
	if (!fileContent.startsWith("---")) return null;

	const secondDelimiter = fileContent.indexOf("\n---", 3);
	if (secondDelimiter === -1) return null;

	const frontmatterRaw = fileContent.slice(0, secondDelimiter + 4); // include closing ---
	const content = fileContent.slice(secondDelimiter + 4).replace(/^\n+/, ""); // trim leading newlines after ---

	return { frontmatterRaw, content };
}

/**
 * Parse frontmatter from a file path. Handles files with or without frontmatter.
 * For files without `---` delimiters, returns sensible defaults derived from the filename.
 */
export function parseFrontmatterFromFile(filePath: string): { frontmatter: PlanFrontmatter; content: string } {
	const raw = readFileSync(filePath, "utf-8");
	const parts = splitFrontmatterAndContent(raw);

	if (parts) {
		const frontmatter = parseFrontmatter(parts.frontmatterRaw);
		return { frontmatter, content: parts.content };
	}

	// No frontmatter — derive defaults from filename
	const basename = filePath.replace(/.*[\\/]/, "").replace(/\.md$/, "");
	const title = basename
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	return {
		frontmatter: {
			title,
			slug: basename,
			status: "idea",
			size: "unknown",
			tags: [],
			created: "",
			updated: "",
			completed: null,
			execution: null,
			has_review: false,
			has_pre_mortem: false,
			has_prd: false,
			steps: 0,
		},
		content: raw,
	};
}

/**
 * Resolve the plans directory path.
 */
function resolvePlansDir(basePath?: string): string {
	// ARETE_TEST_PLANS_DIR allows tests to isolate plan I/O from real plans
	return basePath ?? process.env.ARETE_TEST_PLANS_DIR ?? DEFAULT_PLANS_DIR;
}

/**
 * Save a plan to dev/work/plans/{slug}/plan.md.
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
 * Load a plan from dev/work/plans/{slug}/plan.md.
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

// ────────────────────────────────────────────────────────────
// Backlog, Archive, and Move operations
// ────────────────────────────────────────────────────────────

/**
 * Resolve a directory path with optional override.
 */
function resolveDir(basePath: string | undefined, defaultDir: string): string {
	return basePath ?? defaultDir;
}

/**
 * List archived items (folders only), sorted by updated date.
 */
export function listArchive(basePath?: string): PlanSummary[] {
	const dir = resolveDir(basePath, DEFAULT_ARCHIVE_DIR);
	if (!existsSync(dir)) return [];

	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		const items: PlanSummary[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const planFile = join(dir, entry.name, "plan.md");
			if (!existsSync(planFile)) continue;

			try {
				const { frontmatter } = parseFrontmatterFromFile(planFile);
				items.push({ slug: entry.name, frontmatter });
			} catch {
				// Skip unparseable
			}
		}

		items.sort((a, b) => {
			const dateA = a.frontmatter.updated || "";
			const dateB = b.frontmatter.updated || "";
			return dateB.localeCompare(dateA);
		});
		return items;
	} catch {
		return [];
	}
}

/**
 * Move an item (file or directory) between directories.
 * Handles both flat .md files and folders.
 */
export function moveItem(slug: string, fromDir: string, toDir: string): void {
	if (!existsSync(toDir)) {
		mkdirSync(toDir, { recursive: true });
	}

	// Check for folder first
	const folderSrc = join(fromDir, slug);
	if (existsSync(folderSrc) && statSync(folderSrc).isDirectory()) {
		const dest = join(toDir, slug);
		cpSync(folderSrc, dest, { recursive: true });
		rmSync(folderSrc, { recursive: true, force: true });
		return;
	}

	// Then check for flat file
	const fileSrc = join(fromDir, `${slug}.md`);
	if (existsSync(fileSrc)) {
		const dest = join(toDir, `${slug}.md`);
		renameSync(fileSrc, dest);
		return;
	}

	throw new Error(`Item not found: ${slug} in ${fromDir}`);
}

/**
 * Archive a plan. Moves from plans/ to archive/.
 * Updates status to "complete" or "abandoned" and sets completed date.
 */
export function archiveItem(slug: string, status: "complete" | "abandoned", basePath?: string): void {
	const plansDir = basePath ? join(basePath, "../plans") : DEFAULT_PLANS_DIR;
	const archiveDir = resolveDir(basePath, DEFAULT_ARCHIVE_DIR);

	const src = join(plansDir, slug);
	if (!existsSync(src) || !statSync(src).isDirectory()) {
		throw new Error(`Plan not found: ${slug}`);
	}

	if (!existsSync(archiveDir)) {
		mkdirSync(archiveDir, { recursive: true });
	}

	const dest = join(archiveDir, slug);
	cpSync(src, dest, { recursive: true });
	rmSync(src, { recursive: true, force: true });

	// Update status and completed date in the archive copy
	const planFile = join(dest, "plan.md");
	if (existsSync(planFile)) {
		const { frontmatter, content } = parseFrontmatterFromFile(planFile);
		frontmatter.status = status;
		frontmatter.completed = new Date().toISOString();
		frontmatter.updated = new Date().toISOString();
		const fm = serializeFrontmatter(frontmatter);
		writeFileSync(planFile, `${fm}\n\n${content}`, "utf-8");
	}
}

// ────────────────────────────────────────────────────────────
// Migration
// ────────────────────────────────────────────────────────────

/** Result from migrating backlog items to unified plans */
export interface MigrationResult {
	moved: string[];
	collisions: { slug: string; resolution: string }[];
	skipped: string[];
}

/**
 * Migrate all items from backlog/ to plans/.
 * - Flat .md files → {slug}/plan.md folders
 * - Existing folders → moved as-is, inner file renamed to plan.md if needed
 * - Slug collisions with existing plans → suffixed with -idea
 * - Items without explicit status get status "idea"
 */
export function migrateBacklogToPlans(
	backlogPath?: string,
	plansPath?: string,
): MigrationResult {
	const backlogDir = backlogPath ?? DEFAULT_BACKLOG_DIR;
	const plansDir = plansPath ?? DEFAULT_PLANS_DIR;

	const result: MigrationResult = { moved: [], collisions: [], skipped: [] };

	if (!existsSync(backlogDir)) return result;

	if (!existsSync(plansDir)) {
		mkdirSync(plansDir, { recursive: true });
	}

	const entries = readdirSync(backlogDir, { withFileTypes: true });

	for (const entry of entries) {
		try {
			if (entry.isDirectory()) {
				migrateFolder(entry.name, backlogDir, plansDir, result);
			} else if (entry.name.endsWith(".md")) {
				migrateFlatFile(entry.name, backlogDir, plansDir, result);
			} else {
				result.skipped.push(entry.name);
			}
		} catch {
			result.skipped.push(entry.name);
		}
	}

	return result;
}

/**
 * Resolve a unique slug for migration, handling collisions with existing plans.
 */
function resolveSlug(
	slug: string,
	plansDir: string,
	result: MigrationResult,
): string {
	if (!existsSync(join(plansDir, slug))) return slug;

	const resolved = `${slug}-idea`;
	const resolution = `Collision: "${slug}" already exists in plans, migrated as "${resolved}"`;
	console.log(resolution);
	result.collisions.push({ slug, resolution });
	return resolved;
}

/**
 * Ensure migrated frontmatter has status "idea" if no explicit status was set.
 */
function ensureIdeaStatus(frontmatter: PlanFrontmatter): PlanFrontmatter {
	if (!frontmatter.status || frontmatter.status === ("" as PlanStatus)) {
		return { ...frontmatter, status: "idea" };
	}
	return frontmatter;
}

/**
 * Migrate a flat .md file from backlog to plans.
 */
function migrateFlatFile(
	filename: string,
	backlogDir: string,
	plansDir: string,
	result: MigrationResult,
): void {
	const slug = filename.replace(/\.md$/, "");
	const filePath = join(backlogDir, filename);
	const { frontmatter, content } = parseFrontmatterFromFile(filePath);

	const finalSlug = resolveSlug(slug, plansDir, result);
	const fm = ensureIdeaStatus({ ...frontmatter, slug: finalSlug });

	savePlan(finalSlug, fm, content, plansDir);
	result.moved.push(finalSlug);
}

/**
 * Migrate a folder from backlog to plans.
 * Renames inner file to plan.md if needed.
 */
function migrateFolder(
	folderName: string,
	backlogDir: string,
	plansDir: string,
	result: MigrationResult,
): void {
	const srcDir = join(backlogDir, folderName);
	const finalSlug = resolveSlug(folderName, plansDir, result);
	const destDir = join(plansDir, finalSlug);

	// Copy folder to plans
	cpSync(srcDir, destDir, { recursive: true });

	// Check if plan.md exists; if not, rename the first .md file
	const planFile = join(destDir, "plan.md");
	if (!existsSync(planFile)) {
		const files = readdirSync(destDir).filter((f) => f.endsWith(".md"));
		if (files.length > 0) {
			renameSync(join(destDir, files[0]), planFile);
		}
	}

	// Ensure status is "idea" if not set
	if (existsSync(planFile)) {
		const { frontmatter, content } = parseFrontmatterFromFile(planFile);
		const fm = ensureIdeaStatus({ ...frontmatter, slug: finalSlug });
		const serialized = serializeFrontmatter(fm);
		writeFileSync(planFile, `${serialized}\n\n${content}`, "utf-8");
	}

	result.moved.push(finalSlug);
}
