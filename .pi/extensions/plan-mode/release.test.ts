import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import {
	getCurrentVersion,
	bumpVersion,
	getLatestTag,
	isWorkingTreeClean,
	getCurrentBranch,
	runPreflightChecks,
	getUnreleasedCommits,
	categorizeCommits,
	formatChangelogEntry,
	updateChangelog,
	updatePackageJson,
	executeRelease,
	type UnreleasedCommit,
} from "./release.js";

// ────────────────────────────────────────────────────────────
// Version utilities
// ────────────────────────────────────────────────────────────

describe("getCurrentVersion", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("reads version from package.json", () => {
		writeFileSync(join(tempDir, "package.json"), JSON.stringify({ version: "1.2.3" }));
		assert.equal(getCurrentVersion(tempDir), "1.2.3");
	});

	it("throws if package.json not found", () => {
		assert.throws(() => getCurrentVersion(tempDir), /package\.json not found/);
	});

	it("throws if version field missing", () => {
		writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
		assert.throws(() => getCurrentVersion(tempDir), /missing version field/);
	});
});

describe("bumpVersion", () => {
	it("bumps patch version", () => {
		assert.equal(bumpVersion("0.1.0", "patch"), "0.1.1");
		assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
		assert.equal(bumpVersion("0.0.9", "patch"), "0.0.10");
	});

	it("bumps minor version and resets patch", () => {
		assert.equal(bumpVersion("0.1.0", "minor"), "0.2.0");
		assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
		assert.equal(bumpVersion("0.9.5", "minor"), "0.10.0");
	});

	it("throws on invalid semver format", () => {
		assert.throws(() => bumpVersion("1.2", "patch"), /Invalid semver format/);
		assert.throws(() => bumpVersion("1.2.3.4", "patch"), /Invalid semver format/);
		assert.throws(() => bumpVersion("abc", "patch"), /Invalid semver format/);
	});
});

describe("getLatestTag", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		// Initialize a git repo
		execSync("git init", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns null when no tags exist", () => {
		assert.equal(getLatestTag(tempDir), null);
	});

	it("returns the latest semver tag", () => {
		// Create a commit first (tags need a commit)
		writeFileSync(join(tempDir, "file.txt"), "content");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'initial'", { cwd: tempDir, stdio: "pipe" });

		execSync("git tag v0.1.0", { cwd: tempDir, stdio: "pipe" });
		assert.equal(getLatestTag(tempDir), "v0.1.0");

		execSync("git tag v0.2.0", { cwd: tempDir, stdio: "pipe" });
		assert.equal(getLatestTag(tempDir), "v0.2.0");
	});
});

// ────────────────────────────────────────────────────────────
// Preflight checks
// ────────────────────────────────────────────────────────────

describe("isWorkingTreeClean", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		execSync("git init", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns true for clean tree", () => {
		// Initial empty repo is clean
		assert.equal(isWorkingTreeClean(tempDir), true);
	});

	it("returns false when there are uncommitted changes", () => {
		writeFileSync(join(tempDir, "file.txt"), "content");
		assert.equal(isWorkingTreeClean(tempDir), false);
	});

	it("returns true after committing changes", () => {
		writeFileSync(join(tempDir, "file.txt"), "content");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'initial'", { cwd: tempDir, stdio: "pipe" });
		assert.equal(isWorkingTreeClean(tempDir), true);
	});
});

describe("getCurrentBranch", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		execSync("git init -b main", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });
		// Need at least one commit for branch to show
		writeFileSync(join(tempDir, "file.txt"), "content");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'initial'", { cwd: tempDir, stdio: "pipe" });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns current branch name", () => {
		assert.equal(getCurrentBranch(tempDir), "main");
	});

	it("returns different branch after checkout", () => {
		execSync("git checkout -b feature", { cwd: tempDir, stdio: "pipe" });
		assert.equal(getCurrentBranch(tempDir), "feature");
	});
});

describe("runPreflightChecks", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		execSync("git init -b main", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });
		writeFileSync(join(tempDir, "file.txt"), "content");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'initial'", { cwd: tempDir, stdio: "pipe" });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("passes when tree is clean and on main", () => {
		const result = runPreflightChecks(tempDir);
		assert.equal(result.ok, true);
		assert.equal(result.errors.length, 0);
	});

	it("fails when working tree is dirty", () => {
		writeFileSync(join(tempDir, "dirty.txt"), "uncommitted");
		const result = runPreflightChecks(tempDir);
		assert.equal(result.ok, false);
		assert.ok(result.errors.some((e) => e.includes("not clean")));
	});

	it("fails when not on main branch", () => {
		execSync("git checkout -b feature", { cwd: tempDir, stdio: "pipe" });
		const result = runPreflightChecks(tempDir);
		assert.equal(result.ok, false);
		assert.ok(result.errors.some((e) => e.includes("Not on main branch")));
	});

	it("returns multiple errors when multiple checks fail", () => {
		execSync("git checkout -b feature", { cwd: tempDir, stdio: "pipe" });
		writeFileSync(join(tempDir, "dirty.txt"), "uncommitted");
		const result = runPreflightChecks(tempDir);
		assert.equal(result.ok, false);
		assert.equal(result.errors.length, 2);
	});
});

// ────────────────────────────────────────────────────────────
// Commit history
// ────────────────────────────────────────────────────────────

describe("getUnreleasedCommits", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		execSync("git init -b main", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns empty array when no commits", () => {
		const commits = getUnreleasedCommits(tempDir);
		assert.equal(commits.length, 0);
	});

	it("returns all commits when no tags exist", () => {
		writeFileSync(join(tempDir, "file.txt"), "v1");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'feat: first feature'", { cwd: tempDir, stdio: "pipe" });

		writeFileSync(join(tempDir, "file.txt"), "v2");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'fix: bug fix'", { cwd: tempDir, stdio: "pipe" });

		const commits = getUnreleasedCommits(tempDir);
		assert.equal(commits.length, 2);
		assert.ok(commits.some((c) => c.subject.includes("feat: first feature")));
		assert.ok(commits.some((c) => c.subject.includes("fix: bug fix")));
	});

	it("returns only commits since last tag", () => {
		// Commit 1
		writeFileSync(join(tempDir, "file.txt"), "v1");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'feat: before tag'", { cwd: tempDir, stdio: "pipe" });

		// Tag
		execSync("git tag v0.1.0", { cwd: tempDir, stdio: "pipe" });

		// Commit 2 (after tag)
		writeFileSync(join(tempDir, "file.txt"), "v2");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'feat: after tag'", { cwd: tempDir, stdio: "pipe" });

		const commits = getUnreleasedCommits(tempDir);
		assert.equal(commits.length, 1);
		assert.equal(commits[0].subject, "feat: after tag");
	});
});

// ────────────────────────────────────────────────────────────
// Changelog management
// ────────────────────────────────────────────────────────────

describe("categorizeCommits", () => {
	it("categorizes feat commits as added", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "feat: new feature", date: "2026-03-27" },
			{ hash: "def5678", subject: "feat(core): another feature", date: "2026-03-27" },
		];
		const result = categorizeCommits(commits);
		assert.equal(result.added.length, 2);
		assert.ok(result.added.includes("new feature"));
		assert.ok(result.added.includes("another feature"));
	});

	it("categorizes fix commits as fixed", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "fix: bug fix", date: "2026-03-27" },
			{ hash: "def5678", subject: "fix(ui): ui fix", date: "2026-03-27" },
		];
		const result = categorizeCommits(commits);
		assert.equal(result.fixed.length, 2);
	});

	it("categorizes refactor and perf commits as changed", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "refactor: cleanup code", date: "2026-03-27" },
			{ hash: "def5678", subject: "perf: improve speed", date: "2026-03-27" },
		];
		const result = categorizeCommits(commits);
		assert.equal(result.changed.length, 2);
	});

	it("puts non-conventional commits in other", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "did some stuff", date: "2026-03-27" },
			{ hash: "def5678", subject: "chore: update deps", date: "2026-03-27" },
		];
		const result = categorizeCommits(commits);
		assert.equal(result.other.length, 2);
	});

	it("handles empty commits array", () => {
		const result = categorizeCommits([]);
		assert.equal(result.added.length, 0);
		assert.equal(result.changed.length, 0);
		assert.equal(result.fixed.length, 0);
		assert.equal(result.other.length, 0);
	});
});

describe("formatChangelogEntry", () => {
	it("formats a complete entry with all categories", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "feat: new feature", date: "2026-03-27" },
			{ hash: "def5678", subject: "fix: bug fix", date: "2026-03-27" },
			{ hash: "ghi9012", subject: "refactor: code cleanup", date: "2026-03-27" },
		];
		const entry = formatChangelogEntry("0.2.0", commits);

		assert.ok(entry.includes("## [0.2.0]"));
		assert.ok(entry.includes("### Added"));
		assert.ok(entry.includes("- new feature"));
		assert.ok(entry.includes("### Changed"));
		assert.ok(entry.includes("- code cleanup"));
		assert.ok(entry.includes("### Fixed"));
		assert.ok(entry.includes("- bug fix"));
	});

	it("omits empty categories", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "feat: new feature", date: "2026-03-27" },
		];
		const entry = formatChangelogEntry("0.2.0", commits);

		assert.ok(entry.includes("### Added"));
		assert.ok(!entry.includes("### Changed"));
		assert.ok(!entry.includes("### Fixed"));
	});

	it("falls back to Changed when only non-standard commits", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "did some stuff", date: "2026-03-27" },
		];
		const entry = formatChangelogEntry("0.2.0", commits);

		assert.ok(entry.includes("### Changed"));
		assert.ok(entry.includes("- did some stuff"));
	});
});

describe("updateChangelog", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates new CHANGELOG.md if it does not exist", () => {
		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "feat: new feature", date: "2026-03-27" },
		];
		updateChangelog("0.1.0", commits, tempDir);

		const content = readFileSync(join(tempDir, "CHANGELOG.md"), "utf-8");
		assert.ok(content.includes("# Changelog"));
		assert.ok(content.includes("## [0.1.0]"));
		assert.ok(content.includes("- new feature"));
	});

	it("prepends to existing CHANGELOG.md", () => {
		writeFileSync(
			join(tempDir, "CHANGELOG.md"),
			"# Changelog\n\n## [0.1.0] - 2026-03-20\n\n### Added\n\n- old feature\n",
		);

		const commits: UnreleasedCommit[] = [
			{ hash: "abc1234", subject: "feat: new feature", date: "2026-03-27" },
		];
		updateChangelog("0.2.0", commits, tempDir);

		const content = readFileSync(join(tempDir, "CHANGELOG.md"), "utf-8");
		assert.ok(content.includes("## [0.2.0]"));
		assert.ok(content.includes("## [0.1.0]"));
		// New version should come before old version
		assert.ok(content.indexOf("0.2.0") < content.indexOf("0.1.0"));
	});
});

describe("updatePackageJson", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		writeFileSync(
			join(tempDir, "package.json"),
			JSON.stringify({ name: "test", version: "0.1.0" }, null, 2),
		);
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("updates version in package.json", () => {
		updatePackageJson("0.2.0", tempDir);
		const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
		assert.equal(pkg.version, "0.2.0");
	});

	it("preserves other fields", () => {
		updatePackageJson("0.2.0", tempDir);
		const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
		assert.equal(pkg.name, "test");
	});
});

// ────────────────────────────────────────────────────────────
// Main release flow
// ────────────────────────────────────────────────────────────

describe("executeRelease", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "release-test-"));
		execSync("git init -b main", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
		execSync("git config user.name 'Test'", { cwd: tempDir, stdio: "pipe" });

		// Create package.json
		writeFileSync(
			join(tempDir, "package.json"),
			JSON.stringify({ name: "test", version: "0.1.0" }, null, 2),
		);

		// Initial commit
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'initial'", { cwd: tempDir, stdio: "pipe" });

		// Add a feature commit
		writeFileSync(join(tempDir, "feature.txt"), "content");
		execSync("git add .", { cwd: tempDir, stdio: "pipe" });
		execSync("git commit -m 'feat: new feature'", { cwd: tempDir, stdio: "pipe" });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("dry-run does not modify files", () => {
		const result = executeRelease("patch", { dryRun: true, cwd: tempDir });

		assert.equal(result.dryRun, true);
		assert.equal(result.oldVersion, "0.1.0");
		assert.equal(result.newVersion, "0.1.1");
		assert.ok(result.changelogEntry.includes("0.1.1"));

		// Files should not be changed
		const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
		assert.equal(pkg.version, "0.1.0");
	});

	it("executes full release for patch", () => {
		const result = executeRelease("patch", { cwd: tempDir });

		assert.equal(result.dryRun, false);
		assert.equal(result.oldVersion, "0.1.0");
		assert.equal(result.newVersion, "0.1.1");

		// Check package.json updated
		const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
		assert.equal(pkg.version, "0.1.1");

		// Check CHANGELOG.md created
		const changelog = readFileSync(join(tempDir, "CHANGELOG.md"), "utf-8");
		assert.ok(changelog.includes("## [0.1.1]"));

		// Check git tag created
		const tags = execSync("git tag -l", { cwd: tempDir, encoding: "utf-8" });
		assert.ok(tags.includes("v0.1.1"));
	});

	it("executes full release for minor", () => {
		const result = executeRelease("minor", { cwd: tempDir });

		assert.equal(result.newVersion, "0.2.0");

		const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
		assert.equal(pkg.version, "0.2.0");

		const tags = execSync("git tag -l", { cwd: tempDir, encoding: "utf-8" });
		assert.ok(tags.includes("v0.2.0"));
	});

	it("throws on preflight failure when not dry-run", () => {
		// Make working tree dirty
		writeFileSync(join(tempDir, "dirty.txt"), "uncommitted");

		assert.throws(
			() => executeRelease("patch", { cwd: tempDir }),
			/Preflight failed/,
		);
	});
});
