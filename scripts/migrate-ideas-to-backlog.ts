#!/usr/bin/env npx tsx
/**
 * Migrate status:idea plans to dev/work/backlog/.
 *
 * Usage:
 *   npx tsx scripts/migrate-ideas-to-backlog.ts --dry-run  # Preview what would be moved
 *   npx tsx scripts/migrate-ideas-to-backlog.ts            # Actually move the files
 *
 * What it does:
 * 1. Finds all plans with status: idea in dev/work/plans/
 * 2. For each plan:
 *    - Strips YAML frontmatter, keeping just the content
 *    - Creates dev/work/backlog/{slug}.md with lightweight format (# Title + content)
 *    - Removes the plan folder from dev/work/plans/
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PLANS_DIR = "dev/work/plans";
const BACKLOG_DIR = "dev/work/backlog";

interface MigrationItem {
	slug: string;
	title: string;
	content: string;
}

/**
 * Split frontmatter from content.
 * Returns the content after the frontmatter, or the entire string if no frontmatter.
 */
function stripFrontmatter(raw: string): string {
	if (!raw.startsWith("---")) return raw;

	const secondDelimiter = raw.indexOf("\n---", 3);
	if (secondDelimiter === -1) return raw;

	return raw.slice(secondDelimiter + 4).replace(/^\n+/, "");
}

/**
 * Extract title from frontmatter.
 */
function extractTitle(raw: string): string {
	const match = raw.match(/^title:\s*(.+)$/m);
	if (match) return match[1].trim();

	// Fallback: extract from first # heading
	const headingMatch = raw.match(/^#\s+(.+)$/m);
	if (headingMatch) return headingMatch[1].trim();

	return "Untitled";
}

/**
 * Extract status from frontmatter.
 */
function extractStatus(raw: string): string | null {
	const match = raw.match(/^status:\s*(.+)$/m);
	return match ? match[1].trim() : null;
}

/**
 * Find all plans with status: idea.
 */
function findIdeasToMigrate(): MigrationItem[] {
	if (!existsSync(PLANS_DIR)) {
		console.log(`Plans directory not found: ${PLANS_DIR}`);
		return [];
	}

	const items: MigrationItem[] = [];
	const entries = readdirSync(PLANS_DIR, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const planFile = join(PLANS_DIR, entry.name, "plan.md");
		if (!existsSync(planFile)) continue;

		try {
			const raw = readFileSync(planFile, "utf-8");
			const status = extractStatus(raw);

			if (status === "idea") {
				const title = extractTitle(raw);
				const content = stripFrontmatter(raw);
				items.push({ slug: entry.name, title, content });
			}
		} catch (err) {
			console.error(`Error reading ${planFile}:`, err);
		}
	}

	return items;
}

/**
 * Migrate a single idea to the backlog.
 */
function migrateItem(item: MigrationItem, dryRun: boolean): void {
	const backlogFile = join(BACKLOG_DIR, `${item.slug}.md`);
	const planDir = join(PLANS_DIR, item.slug);

	// Check if backlog file already exists
	if (existsSync(backlogFile)) {
		console.log(`  ⚠️  Skipping ${item.slug}: ${backlogFile} already exists`);
		return;
	}

	// Ensure content starts with # Title
	let finalContent = item.content.trim();
	if (!finalContent.startsWith("# ")) {
		finalContent = `# ${item.title}\n\n${finalContent}`;
	}

	if (dryRun) {
		console.log(`  📋 Would migrate: ${item.slug} → ${backlogFile}`);
		return;
	}

	// Create backlog directory if needed
	if (!existsSync(BACKLOG_DIR)) {
		mkdirSync(BACKLOG_DIR, { recursive: true });
	}

	// Write the backlog file
	writeFileSync(backlogFile, finalContent, "utf-8");

	// Remove the plan directory
	rmSync(planDir, { recursive: true, force: true });

	console.log(`  ✅ Migrated: ${item.slug} → ${backlogFile}`);
}

/**
 * Main entry point.
 */
function main(): void {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");

	console.log(`\n🔄 Migrating status:idea plans to backlog/\n`);

	if (dryRun) {
		console.log("   (dry-run mode — no changes will be made)\n");
	}

	const items = findIdeasToMigrate();

	if (items.length === 0) {
		console.log("No plans with status: idea found.\n");
		return;
	}

	console.log(`Found ${items.length} plan(s) with status: idea:\n`);

	for (const item of items) {
		migrateItem(item, dryRun);
	}

	console.log();

	if (dryRun) {
		console.log(`Run without --dry-run to actually migrate these ${items.length} item(s).`);
	} else {
		console.log(`Migration complete. ${items.length} item(s) moved to ${BACKLOG_DIR}/`);
		console.log(`\nUse '/plan promote <slug>' to promote a backlog item back to an active plan.`);
	}

	console.log();
}

main();
