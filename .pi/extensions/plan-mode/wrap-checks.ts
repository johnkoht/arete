/**
 * Close-out detection functions for /wrap command.
 *
 * Pure functions for checking documentation completeness after plan execution.
 * Each function is designed for testability with no Pi runtime dependencies.
 *
 * No external dependencies — uses node:fs, node:path, and node:child_process only.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPlan, type PlanStatus } from "./persistence.js";

// Path constants — matches AGENTS.md § Workspace
const MEMORY_ENTRIES_DIR = "memory/entries"; // matches AGENTS.md § Memory: `memory/entries/YYYY-MM-DD_slug.md`
const MEMORY_INDEX_FILE = "memory/MEMORY.md"; // matches AGENTS.md § Memory: index file
const CAPABILITY_CATALOG_FILE = "dev/catalog/capabilities.json"; // matches AGENTS.md § Conventions: dev/catalog

/**
 * Check if a memory entry exists for the given slug.
 * Uses glob pattern: memory/entries/*_${slug}*.md
 *
 * @param slug - Plan slug to search for
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns true if matching entry exists, false otherwise
 */
export function checkMemoryEntry(slug: string, cwd: string = process.cwd()): boolean {
	const entriesDir = join(cwd, MEMORY_ENTRIES_DIR);

	if (!existsSync(entriesDir)) {
		return false;
	}

	try {
		const files = readdirSync(entriesDir);
		// Pattern: YYYY-MM-DD_slug.md or YYYY-MM-DD_slug-suffix.md
		// Matches: *_${slug}*.md (slug may be part of filename)
		const pattern = new RegExp(`_${escapeRegExp(slug)}[^/]*\\.md$`, "i");
		return files.some((file) => pattern.test(file));
	} catch {
		return false;
	}
}

/**
 * Check if MEMORY.md index contains a reference to the given slug.
 * Searches for the slug string in the memory index file.
 *
 * @param slug - Plan slug to search for
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns true if slug is referenced in MEMORY.md, false otherwise
 */
export function checkMemoryIndex(slug: string, cwd: string = process.cwd()): boolean {
	const indexPath = join(cwd, MEMORY_INDEX_FILE);

	if (!existsSync(indexPath)) {
		return false;
	}

	try {
		const content = readFileSync(indexPath, "utf-8");
		// Check if slug appears in the index (case-insensitive)
		// Common format: `[title](entries/YYYY-MM-DD_slug.md)`
		return content.toLowerCase().includes(slug.toLowerCase());
	} catch {
		return false;
	}
}

/**
 * Get the status of a plan from its frontmatter.
 *
 * @param slug - Plan slug to check
 * @param basePath - Base path for plans directory (optional, for testing)
 * @returns Plan status string, or null if plan doesn't exist
 */
export function checkPlanStatus(slug: string, basePath?: string): PlanStatus | null {
	const plan = loadPlan(slug, basePath);
	if (!plan) {
		return null;
	}
	return plan.frontmatter.status;
}

/**
 * Get directories that have changed since a given date.
 * Uses `git diff --name-only` to find changed files and extracts unique directories.
 *
 * @param since - Date to check changes from
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Array of changed directory paths, empty array if no changes, null if git fails
 */
export function getChangedDirectories(since: Date, cwd: string = process.cwd()): string[] | null {
	try {
		// Format date as ISO string for git
		const sinceStr = since.toISOString();

		// Get list of changed files since the given date
		const output = execSync(`git log --name-only --pretty=format: --since="${sinceStr}"`, {
			cwd,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"], // Capture stderr too
		});

		if (!output.trim()) {
			return [];
		}

		// Extract unique directories from changed file paths
		const files = output.trim().split("\n");
		const directories = new Set<string>();

		for (const file of files) {
			// Get directory part of the path
			const lastSlash = file.lastIndexOf("/");
			if (lastSlash > 0) {
				directories.add(file.slice(0, lastSlash));
			} else if (lastSlash === -1 && file) {
				// Root-level file
				directories.add(".");
			}
		}

		return Array.from(directories).sort();
	} catch {
		// Git not available or command failed — graceful fallback
		return null;
	}
}

/**
 * Check the capability catalog for its lastUpdated date.
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Date of last update, or null if file missing/malformed
 */
export function checkCapabilityCatalog(cwd: string = process.cwd()): Date | null {
	const catalogPath = join(cwd, CAPABILITY_CATALOG_FILE);

	if (!existsSync(catalogPath)) {
		return null;
	}

	try {
		const content = readFileSync(catalogPath, "utf-8");
		const catalog = JSON.parse(content) as { lastUpdated?: string };

		if (!catalog.lastUpdated) {
			return null;
		}

		// Parse the date string (format: "YYYY-MM-DD" or ISO string)
		const date = new Date(catalog.lastUpdated);

		// Check for invalid date
		if (isNaN(date.getTime())) {
			return null;
		}

		return date;
	} catch {
		// JSON parse failed or file read error
		return null;
	}
}

/**
 * Escape special regex characters in a string.
 * Used to safely create regex patterns from user input.
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
