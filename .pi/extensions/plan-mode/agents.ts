/**
 * Agent configuration module.
 *
 * Loads agent model configuration from settings.json and
 * agent prompt definitions from .pi/agents/ markdown files.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Supported agent roles */
export type AgentRole = "product-manager" | "orchestrator" | "reviewer" | "developer";

/** Agent config with single model */
export interface SingleModelConfig {
	model?: string;
}

/** Agent config with primary/secondary models (for cross-model review) */
export interface DualModelConfig {
	primary?: string;
	secondary?: string;
}

/** Agent configuration (either single or dual model) */
export type AgentConfig = SingleModelConfig | DualModelConfig;

/** Full agents configuration section from settings.json */
export type AgentsConfig = Partial<Record<AgentRole, AgentConfig>>;

/** Parsed model reference */
export interface ParsedModel {
	provider: string;
	modelId: string;
}

/**
 * Check if an agent config has dual model setup.
 */
function isDualModel(config: AgentConfig): config is DualModelConfig {
	return "primary" in config || "secondary" in config;
}

/**
 * Load the agents configuration section from settings.json.
 * Returns empty object if settings.json doesn't exist or has no agents section.
 */
export function loadAgentConfig(settingsPath?: string): AgentsConfig {
	const path = settingsPath ?? join(".pi", "settings.json");

	if (!existsSync(path)) return {};

	try {
		const raw = readFileSync(path, "utf-8");
		const settings = JSON.parse(raw) as Record<string, unknown>;
		const agents = settings.agents as AgentsConfig | undefined;
		return agents ?? {};
	} catch {
		return {};
	}
}

/**
 * Get the configured model ID for an agent role.
 * For dual-model configs (product-manager), use variant to select primary/secondary.
 * Returns null if not configured (meaning: use current model).
 */
export function getAgentModel(
	role: AgentRole,
	config: AgentsConfig,
	variant?: "primary" | "secondary",
): string | null {
	const agentConfig = config[role];
	if (!agentConfig) return null;

	if (isDualModel(agentConfig)) {
		if (variant === "secondary") {
			return agentConfig.secondary ?? null;
		}
		return agentConfig.primary ?? null;
	}

	return (agentConfig as SingleModelConfig).model ?? null;
}

/**
 * Read an agent prompt definition from .pi/agents/{role}.md.
 * Strips YAML frontmatter, returns the markdown content.
 * Returns null if the agent file doesn't exist.
 */
export function getAgentPrompt(role: AgentRole, agentsDir?: string): string | null {
	const dir = agentsDir ?? join(".pi", "agents");
	const filePath = join(dir, `${role}.md`);

	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");

		// Strip YAML frontmatter if present
		if (raw.startsWith("---")) {
			const endDelimiter = raw.indexOf("\n---", 3);
			if (endDelimiter !== -1) {
				return raw.slice(endDelimiter + 4).trim();
			}
		}

		return raw.trim();
	} catch {
		return null;
	}
}

/**
 * Parse a "provider/model-id" string into provider and model ID components.
 * Returns null if the format is invalid.
 */
export function resolveModel(modelId: string): ParsedModel | null {
	if (!modelId || typeof modelId !== "string") return null;

	const slashIndex = modelId.indexOf("/");
	if (slashIndex <= 0 || slashIndex === modelId.length - 1) return null;

	return {
		provider: modelId.slice(0, slashIndex),
		modelId: modelId.slice(slashIndex + 1),
	};
}
