/**
 * Conversation insight extraction via LLM.
 *
 * Produces structured JSON output with optional sections:
 *   summary, decisions, action_items, open_questions, stakeholders, risks.
 *
 * Source-agnostic prompt — works with any conversation text.
 * Uses dependency injection for the LLM call to enable testability.
 */

import type { ConversationInsights } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;

/**
 * Raw JSON shape returned by the LLM (snake_case to match prompt).
 * All fields are optional — the LLM may omit sections when not warranted.
 */
type RawExtractionResult = {
  summary?: string;
  decisions?: string[];
  action_items?: string[];
  open_questions?: string[];
  stakeholders?: string[];
  risks?: string[];
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildExtractionPrompt(conversationText: string): string {
  return `You are analyzing a conversation transcript. This could be from Slack, Teams, email, or any other source.

Extract structured insights from the conversation below. Return ONLY valid JSON with no markdown formatting, no code fences, no explanation.

Include only sections that are clearly present in the conversation. Omit any section where the conversation doesn't contain relevant content.

JSON schema (all fields optional):
{
  "summary": "string — 2-3 sentence summary of the conversation",
  "decisions": ["string — each decision made"],
  "action_items": ["string — each action item or follow-up"],
  "open_questions": ["string — each unresolved question"],
  "stakeholders": ["string — each person or team mentioned as involved/responsible"],
  "risks": ["string — each risk or concern raised"]
}

Rules:
- Return ONLY the JSON object, no other text
- Omit keys entirely if that section has no content (do NOT include empty arrays or empty strings)
- Keep each item concise (1-2 sentences max)
- Be factual — only extract what's explicitly in the conversation

Conversation:
${conversationText}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into a ConversationInsights object.
 * Handles various response formats gracefully.
 */
function parseExtractionResponse(response: string): ConversationInsights {
  const trimmed = response.trim();

  // Try to extract JSON from the response (handle code fences, extra text)
  let jsonStr = trimmed;

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to find a JSON object in the string
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  let raw: RawExtractionResult;
  try {
    raw = JSON.parse(jsonStr) as RawExtractionResult;
  } catch {
    // If parsing fails completely, return empty insights
    return {};
  }

  // Map snake_case to camelCase and filter out empty values
  const insights: ConversationInsights = {};

  if (typeof raw.summary === 'string' && raw.summary.trim() !== '') {
    insights.summary = raw.summary.trim();
  }

  if (Array.isArray(raw.decisions) && raw.decisions.length > 0) {
    insights.decisions = raw.decisions.filter((d) => typeof d === 'string' && d.trim() !== '');
    if (insights.decisions.length === 0) delete insights.decisions;
  }

  if (Array.isArray(raw.action_items) && raw.action_items.length > 0) {
    insights.actionItems = raw.action_items.filter((a) => typeof a === 'string' && a.trim() !== '');
    if (insights.actionItems.length === 0) delete insights.actionItems;
  }

  if (Array.isArray(raw.open_questions) && raw.open_questions.length > 0) {
    insights.openQuestions = raw.open_questions.filter((q) => typeof q === 'string' && q.trim() !== '');
    if (insights.openQuestions.length === 0) delete insights.openQuestions;
  }

  if (Array.isArray(raw.stakeholders) && raw.stakeholders.length > 0) {
    insights.stakeholders = raw.stakeholders.filter((s) => typeof s === 'string' && s.trim() !== '');
    if (insights.stakeholders.length === 0) delete insights.stakeholders;
  }

  if (Array.isArray(raw.risks) && raw.risks.length > 0) {
    insights.risks = raw.risks.filter((r) => typeof r === 'string' && r.trim() !== '');
    if (insights.risks.length === 0) delete insights.risks;
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract insights from conversation text using an LLM.
 *
 * @param conversationText - The normalized conversation text to analyze
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @returns Extracted insights with only populated sections
 */
export async function extractInsights(
  conversationText: string,
  callLLM: LLMCallFn,
): Promise<ConversationInsights> {
  if (!conversationText || conversationText.trim() === '') {
    return {};
  }

  const prompt = buildExtractionPrompt(conversationText);
  try {
    const response = await callLLM(prompt);
    return parseExtractionResponse(response);
  } catch {
    // LLM call failed (network error, rate limit, etc.) — return empty insights
    // rather than propagating the error. The conversation can still be saved
    // without insights; the user can re-extract later.
    return {};
  }
}

// Exported for testing
export { buildExtractionPrompt, parseExtractionResponse };
