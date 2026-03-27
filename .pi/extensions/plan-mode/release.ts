/**
 * Release management utilities for semantic versioning.
 *
 * Provides version bumping, changelog generation, and git tagging.
 * All operations are atomic — commit includes package.json + CHANGELOG.md + tag.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type BumpType = "patch" | "minor";

export interface PreflightResult {
	ok: boolean;
	errors: string[];
}

export interface UnreleasedCommit {
	hash: string;
	subject: string;
	date: string;
}

export interface ReleaseOptions {
	dryRun?: boolean;
	cwd?: string;
}

export interface ReleaseResult {
	oldVersion: string;
	newVersion: string;
	commits: UnreleasedCommit[];
	changelogEntry: string;
	dryRun: boolean;
}

// ────────────────────────────────────────────────────────────
// Version utilities
// ────────────────────────────────────────────────────────────

/**
 * Read current version from package.json.
 * @param cwd Working directory (defaults to process.cwd())
 */
export function getCurrentVersion(cwd: string = process.cwd()): string {
	const pkgPath = join(cwd, "package.json");
	if (!existsSync(pkgPath)) {
		throw new Error("package.json not found");
	}
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	if (!pkg.version || typeof pkg.version !== "string") {
		throw new Error("package.json missing version field");
	}
	return pkg.version;
}

/**
 * Calculate the next version based on bump type.
 * - patch: 0.1.0 → 0.1.1
 * - minor: 0.1.0 → 0.2.0
 */
export function bumpVersion(current: string, type: BumpType): string {
	const parts = current.split(".");
	if (parts.length !== 3) {
		throw new Error(`Invalid semver format: ${current}`);
	}
	
	const [major, minor, patch] = parts.map((p) => parseInt(p, 10));
	if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
		throw new Error(`Invalid semver format: ${current}`);
	}
	
	if (type === "minor") {
		return `${major}.${minor + 1}.0`;
	}
	// patch
	return `${major}.${minor}.${patch + 1}`;
}

/**
 * Get the latest git tag matching vX.Y.Z pattern.
 * Returns null if no tags exist.
 */
export function getLatestTag(cwd: string = process.cwd()): string | null {
	try {
		const output = execSync("git tag -l 'v*' --sort=-v:refname", {
			encoding: "utf-8",
			cwd,
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const tags = output.trim().split("\n").filter(Boolean);
		return tags[0] ?? null;
	} catch {
		return null;
	}
}

// ────────────────────────────────────────────────────────────
// Preflight checks
// ────────────────────────────────────────────────────────────

/**
 * Check if working tree is clean (no uncommitted changes).
 */
export function isWorkingTreeClean(cwd: string = process.cwd()): boolean {
	try {
		const output = execSync("git status --porcelain", {
			encoding: "utf-8",
			cwd,
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return output.trim() === "";
	} catch {
		return false;
	}
}

/**
 * Get the current git branch name.
 */
export function getCurrentBranch(cwd: string = process.cwd()): string | null {
	try {
		const output = execSync("git branch --show-current", {
			encoding: "utf-8",
			cwd,
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return output.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Run all preflight checks required before release.
 * Returns { ok: true } if all pass, or { ok: false, errors: [...] } with failure reasons.
 */
export function runPreflightChecks(cwd: string = process.cwd()): PreflightResult {
	const errors: string[] = [];
	
	// Check 1: Working tree must be clean
	if (!isWorkingTreeClean(cwd)) {
		errors.push("Working tree is not clean. Commit or stash changes first.");
	}
	
	// Check 2: Must be on main branch
	const branch = getCurrentBranch(cwd);
	if (branch !== "main") {
		errors.push(`Not on main branch (current: ${branch ?? "unknown"}). Switch to main first.`);
	}
	
	return {
		ok: errors.length === 0,
		errors,
	};
}

// ────────────────────────────────────────────────────────────
// Commit history
// ────────────────────────────────────────────────────────────

/**
 * Get commits since the last tag (or all commits if no tags).
 * Returns array of { hash, subject, date }.
 */
export function getUnreleasedCommits(cwd: string = process.cwd()): UnreleasedCommit[] {
	const lastTag = getLatestTag(cwd);
	const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
	
	try {
		const output = execSync(
			`git log ${range} --pretty=format:"%H|%s|%cs" --no-merges`,
			{
				encoding: "utf-8",
				cwd,
				timeout: 10000,
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		
		if (!output.trim()) {
			return [];
		}
		
		return output
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [hash, subject, date] = line.split("|");
				return {
					hash: hash?.slice(0, 7) ?? "",
					subject: subject ?? "",
					date: date ?? "",
				};
			});
	} catch {
		return [];
	}
}

// ────────────────────────────────────────────────────────────
// Changelog management
// ────────────────────────────────────────────────────────────

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

/**
 * Categorize commits by conventional commit type.
 * Returns { added: [...], changed: [...], fixed: [...], other: [...] }
 */
export function categorizeCommits(commits: UnreleasedCommit[]): {
	added: string[];
	changed: string[];
	fixed: string[];
	other: string[];
} {
	const result = {
		added: [] as string[],
		changed: [] as string[],
		fixed: [] as string[],
		other: [] as string[],
	};
	
	for (const commit of commits) {
		const subject = commit.subject;
		
		// Parse conventional commit format: type(scope): description
		// or type: description
		const match = subject.match(/^(feat|fix|chore|docs|style|refactor|perf|test)(?:\([^)]+\))?:\s*(.+)$/i);
		
		if (match) {
			const [, type, description] = match;
			const cleanDesc = description?.trim() ?? subject;
			
			switch (type?.toLowerCase()) {
				case "feat":
					result.added.push(cleanDesc);
					break;
				case "fix":
					result.fixed.push(cleanDesc);
					break;
				case "refactor":
				case "perf":
					result.changed.push(cleanDesc);
					break;
				default:
					// chore, docs, style, test → skip or other
					result.other.push(cleanDesc);
			}
		} else {
			// Non-conventional commit → other
			result.other.push(subject);
		}
	}
	
	return result;
}

/**
 * Format a changelog entry for a new version.
 */
export function formatChangelogEntry(version: string, commits: UnreleasedCommit[]): string {
	const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
	const categorized = categorizeCommits(commits);
	
	const lines: string[] = [];
	lines.push(`## [${version}] - ${date}`);
	lines.push("");
	
	if (categorized.added.length > 0) {
		lines.push("### Added");
		for (const item of categorized.added) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}
	
	if (categorized.changed.length > 0) {
		lines.push("### Changed");
		for (const item of categorized.changed) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}
	
	if (categorized.fixed.length > 0) {
		lines.push("### Fixed");
		for (const item of categorized.fixed) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}
	
	// Only include "other" if we have nothing else (fallback)
	if (categorized.added.length === 0 && categorized.changed.length === 0 && categorized.fixed.length === 0) {
		if (categorized.other.length > 0) {
			lines.push("### Changed");
			for (const item of categorized.other) {
				lines.push(`- ${item}`);
			}
			lines.push("");
		}
	}
	
	return lines.join("\n");
}

/**
 * Update CHANGELOG.md with a new version entry.
 * Creates the file if it doesn't exist.
 */
export function updateChangelog(version: string, commits: UnreleasedCommit[], cwd: string = process.cwd()): string {
	const changelogPath = join(cwd, "CHANGELOG.md");
	const entry = formatChangelogEntry(version, commits);
	
	let content: string;
	
	if (existsSync(changelogPath)) {
		const existing = readFileSync(changelogPath, "utf-8");
		// Insert new entry after the header (after first ## or after header text)
		const headerEndMatch = existing.match(/^(#\s+Changelog[\s\S]*?)(\n## |\n\[Unreleased\]|$)/m);
		
		if (headerEndMatch) {
			const header = headerEndMatch[1];
			const rest = existing.slice(header.length);
			content = header + "\n" + entry + rest;
		} else {
			// No recognizable header, prepend
			content = CHANGELOG_HEADER + entry + "\n" + existing;
		}
	} else {
		// Create new changelog
		content = CHANGELOG_HEADER + entry;
	}
	
	writeFileSync(changelogPath, content, "utf-8");
	return entry;
}

/**
 * Update version in package.json.
 */
export function updatePackageJson(version: string, cwd: string = process.cwd()): void {
	const pkgPath = join(cwd, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	pkg.version = version;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

// ────────────────────────────────────────────────────────────
// Git operations
// ────────────────────────────────────────────────────────────

/**
 * Create an atomic release commit with package.json and CHANGELOG.md.
 */
export function createReleaseCommit(version: string, cwd: string = process.cwd()): void {
	execSync("git add package.json CHANGELOG.md", {
		encoding: "utf-8",
		cwd,
		timeout: 5000,
		stdio: ["pipe", "pipe", "pipe"],
	});
	
	execSync(`git commit -m "release: v${version}"`, {
		encoding: "utf-8",
		cwd,
		timeout: 10000,
		stdio: ["pipe", "pipe", "pipe"],
	});
}

/**
 * Create a git tag for the version.
 */
export function createGitTag(version: string, cwd: string = process.cwd()): void {
	execSync(`git tag -a v${version} -m "Release v${version}"`, {
		encoding: "utf-8",
		cwd,
		timeout: 5000,
		stdio: ["pipe", "pipe", "pipe"],
	});
}

// ────────────────────────────────────────────────────────────
// Main release flow
// ────────────────────────────────────────────────────────────

/**
 * Execute a full release (or dry-run).
 *
 * 1. Run preflight checks
 * 2. Calculate new version
 * 3. Get unreleased commits
 * 4. Update CHANGELOG.md
 * 5. Update package.json
 * 6. Create atomic commit
 * 7. Create git tag
 *
 * Returns release info. Throws on preflight failure.
 */
export function executeRelease(
	type: BumpType,
	options: ReleaseOptions = {},
): ReleaseResult {
	const { dryRun = false, cwd = process.cwd() } = options;
	
	// Preflight checks (skip in dry-run to allow testing)
	if (!dryRun) {
		const preflight = runPreflightChecks(cwd);
		if (!preflight.ok) {
			throw new Error(`Preflight failed:\n${preflight.errors.map((e) => `  • ${e}`).join("\n")}`);
		}
	}
	
	// Calculate versions
	const oldVersion = getCurrentVersion(cwd);
	const newVersion = bumpVersion(oldVersion, type);
	
	// Get commits for changelog
	const commits = getUnreleasedCommits(cwd);
	
	// Generate changelog entry
	const changelogEntry = formatChangelogEntry(newVersion, commits);
	
	if (!dryRun) {
		// Update files
		updateChangelog(newVersion, commits, cwd);
		updatePackageJson(newVersion, cwd);
		
		// Atomic commit + tag
		createReleaseCommit(newVersion, cwd);
		createGitTag(newVersion, cwd);
	}
	
	return {
		oldVersion,
		newVersion,
		commits,
		changelogEntry,
		dryRun,
	};
}
