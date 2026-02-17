import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTemplates, getTemplate, getTemplateOptions } from "./templates.js";
import { extractTodoItems } from "./utils.js";

describe("getTemplates", () => {
	it("returns all built-in templates", () => {
		const templates = getTemplates();
		assert.ok(templates.length >= 3);
	});

	it("each template has required fields", () => {
		for (const t of getTemplates()) {
			assert.ok(t.name, `Template missing name`);
			assert.ok(t.slug, `Template ${t.name} missing slug`);
			assert.ok(t.description, `Template ${t.name} missing description`);
			assert.ok(t.content, `Template ${t.name} missing content`);
		}
	});

	it("each template content has Plan: header", () => {
		for (const t of getTemplates()) {
			assert.ok(
				t.content.includes("Plan:"),
				`Template ${t.name} missing Plan: header`,
			);
		}
	});

	it("each template content is compatible with extractTodoItems", () => {
		for (const t of getTemplates()) {
			const items = extractTodoItems(t.content);
			assert.ok(
				items.length >= 3,
				`Template ${t.name} extracted ${items.length} items (expected >= 3)`,
			);
		}
	});

	it("each template has numbered steps with AC", () => {
		for (const t of getTemplates()) {
			assert.ok(
				t.content.includes("- AC:"),
				`Template ${t.name} missing acceptance criteria`,
			);
		}
	});
});

describe("getTemplate", () => {
	it("returns discovery template by slug", () => {
		const t = getTemplate("discovery");
		assert.ok(t);
		assert.equal(t.name, "Discovery");
	});

	it("returns refactor template by slug", () => {
		const t = getTemplate("refactor");
		assert.ok(t);
		assert.equal(t.name, "Refactor");
	});

	it("returns integration template by slug", () => {
		const t = getTemplate("integration");
		assert.ok(t);
		assert.equal(t.name, "Integration");
	});

	it("returns null for unknown slug", () => {
		assert.equal(getTemplate("nonexistent"), null);
	});

	it("returns null for empty slug", () => {
		assert.equal(getTemplate(""), null);
	});
});

describe("getTemplateOptions", () => {
	it("returns formatted options with name and description", () => {
		const options = getTemplateOptions();
		assert.ok(options.length >= 3);
		for (const opt of options) {
			assert.ok(opt.includes(" — "), `Option missing separator: ${opt}`);
		}
	});

	it("options match template order", () => {
		const templates = getTemplates();
		const options = getTemplateOptions();
		assert.equal(options.length, templates.length);
		for (let i = 0; i < templates.length; i++) {
			assert.ok(options[i].startsWith(templates[i].name));
		}
	});
});

describe("template extractTodoItems integration", () => {
	it("discovery template extracts 5 steps", () => {
		const t = getTemplate("discovery");
		assert.ok(t);
		const items = extractTodoItems(t.content);
		assert.equal(items.length, 5);
	});

	it("refactor template extracts 5 steps", () => {
		const t = getTemplate("refactor");
		assert.ok(t);
		const items = extractTodoItems(t.content);
		assert.equal(items.length, 5);
	});

	it("integration template extracts 5 steps", () => {
		const t = getTemplate("integration");
		assert.ok(t);
		const items = extractTodoItems(t.content);
		assert.equal(items.length, 5);
	});

	it("extracted items have meaningful text", () => {
		for (const t of getTemplates()) {
			const items = extractTodoItems(t.content);
			for (const item of items) {
				assert.ok(item.text.length > 3, `Item text too short in ${t.name}: "${item.text}"`);
				assert.equal(item.completed, false);
			}
		}
	});
});
