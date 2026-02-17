import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	loadAgentConfig,
	getAgentModel,
	getAgentPrompt,
	resolveModel,
	type AgentsConfig,
} from "./agents.js";

const FULL_CONFIG: AgentsConfig = {
	"product-manager": {
		primary: "anthropic/claude-opus-4-6",
		secondary: "openai/gpt-5.3",
	},
	orchestrator: {
		model: "anthropic/claude-opus-4-6",
	},
	reviewer: {
		model: "anthropic/claude-sonnet-4-6",
	},
	developer: {
		model: "anthropic/claude-sonnet-4-6",
	},
};

describe("loadAgentConfig", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "agent-config-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("loads full agent config from settings.json", () => {
		const settingsPath = join(tempDir, "settings.json");
		writeFileSync(settingsPath, JSON.stringify({ tools: ["read", "bash"], agents: FULL_CONFIG }), "utf-8");

		const config = loadAgentConfig(settingsPath);
		assert.ok(config["product-manager"]);
		assert.ok(config.orchestrator);
		assert.ok(config.reviewer);
		assert.ok(config.developer);
	});

	it("returns empty object when settings.json does not exist", () => {
		const config = loadAgentConfig(join(tempDir, "nonexistent.json"));
		assert.deepEqual(config, {});
	});

	it("returns empty object when agents key is missing", () => {
		const settingsPath = join(tempDir, "settings.json");
		writeFileSync(settingsPath, JSON.stringify({ tools: ["read"] }), "utf-8");

		const config = loadAgentConfig(settingsPath);
		assert.deepEqual(config, {});
	});

	it("returns empty object for invalid JSON", () => {
		const settingsPath = join(tempDir, "settings.json");
		writeFileSync(settingsPath, "not valid json {{{", "utf-8");

		const config = loadAgentConfig(settingsPath);
		assert.deepEqual(config, {});
	});
});

describe("getAgentModel", () => {
	it("returns primary model for product-manager (default)", () => {
		const model = getAgentModel("product-manager", FULL_CONFIG);
		assert.equal(model, "anthropic/claude-opus-4-6");
	});

	it("returns primary model for product-manager (explicit variant)", () => {
		const model = getAgentModel("product-manager", FULL_CONFIG, "primary");
		assert.equal(model, "anthropic/claude-opus-4-6");
	});

	it("returns secondary model for product-manager", () => {
		const model = getAgentModel("product-manager", FULL_CONFIG, "secondary");
		assert.equal(model, "openai/gpt-5.3");
	});

	it("returns model for orchestrator", () => {
		const model = getAgentModel("orchestrator", FULL_CONFIG);
		assert.equal(model, "anthropic/claude-opus-4-6");
	});

	it("returns model for reviewer", () => {
		const model = getAgentModel("reviewer", FULL_CONFIG);
		assert.equal(model, "anthropic/claude-sonnet-4-6");
	});

	it("returns model for developer", () => {
		const model = getAgentModel("developer", FULL_CONFIG);
		assert.equal(model, "anthropic/claude-sonnet-4-6");
	});

	it("returns null when role is not configured", () => {
		const model = getAgentModel("developer", {});
		assert.equal(model, null);
	});

	it("returns null when config is empty", () => {
		const model = getAgentModel("product-manager", {});
		assert.equal(model, null);
	});

	it("returns null for secondary when only primary is set", () => {
		const config: AgentsConfig = {
			"product-manager": { primary: "anthropic/claude-opus-4-6" },
		};
		const model = getAgentModel("product-manager", config, "secondary");
		assert.equal(model, null);
	});
});

describe("getAgentPrompt", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "agent-prompt-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("reads agent markdown content without frontmatter", () => {
		const content = `---
name: orchestrator
description: Senior Engineering Manager
---

You are the Orchestrator.

## Goals

- Understand the PRD
- Break down work`;
		writeFileSync(join(tempDir, "orchestrator.md"), content, "utf-8");

		const prompt = getAgentPrompt("orchestrator", tempDir);
		assert.ok(prompt);
		assert.ok(prompt.startsWith("You are the Orchestrator."));
		assert.ok(prompt.includes("## Goals"));
		assert.ok(!prompt.includes("---"));
		assert.ok(!prompt.includes("name: orchestrator"));
	});

	it("returns full content when no frontmatter", () => {
		writeFileSync(join(tempDir, "developer.md"), "You are a developer.", "utf-8");

		const prompt = getAgentPrompt("developer", tempDir);
		assert.equal(prompt, "You are a developer.");
	});

	it("returns null for non-existent agent file", () => {
		const prompt = getAgentPrompt("product-manager", tempDir);
		assert.equal(prompt, null);
	});

	it("handles empty agent file", () => {
		writeFileSync(join(tempDir, "reviewer.md"), "", "utf-8");

		const prompt = getAgentPrompt("reviewer", tempDir);
		assert.equal(prompt, "");
	});
});

describe("resolveModel", () => {
	it("parses anthropic/claude-opus-4-6", () => {
		const result = resolveModel("anthropic/claude-opus-4-6");
		assert.ok(result);
		assert.equal(result.provider, "anthropic");
		assert.equal(result.modelId, "claude-opus-4-6");
	});

	it("parses openai/gpt-5.3", () => {
		const result = resolveModel("openai/gpt-5.3");
		assert.ok(result);
		assert.equal(result.provider, "openai");
		assert.equal(result.modelId, "gpt-5.3");
	});

	it("returns null for empty string", () => {
		assert.equal(resolveModel(""), null);
	});

	it("returns null for string without slash", () => {
		assert.equal(resolveModel("claude-opus"), null);
	});

	it("returns null for string starting with slash", () => {
		assert.equal(resolveModel("/claude-opus"), null);
	});

	it("returns null for string ending with slash", () => {
		assert.equal(resolveModel("anthropic/"), null);
	});

	it("handles model IDs with multiple segments", () => {
		const result = resolveModel("anthropic/claude-sonnet-4-20250514");
		assert.ok(result);
		assert.equal(result.provider, "anthropic");
		assert.equal(result.modelId, "claude-sonnet-4-20250514");
	});
});
