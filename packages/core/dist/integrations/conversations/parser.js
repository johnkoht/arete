/**
 * Conversation text parser with fallback chain.
 *
 * Fallback order:
 *   1. Structured with timestamps: [timestamp] Name: message
 *   2. Structured without timestamps: Name: message
 *   3. Raw text paragraph splitting
 *   4. Always succeed (never throws)
 *
 * Source-agnostic — no Slack-specific parsing (no emoji, no <@mention>, no thread markers).
 */
// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------
/**
 * Matches: [10:30 AM] Alice: Hello everyone
 * Or:      [2026-02-20 10:30] Alice: Hello everyone
 * Or:      [10:30:45] Alice: Hello
 */
const TIMESTAMPED_LINE = /^\[([^\]]+)\]\s+([^:]+):\s*(.+)/;
/**
 * Matches: Alice: Hello everyone
 * Requires speaker name to be 1-4 words (avoids matching random colon usage).
 */
const STRUCTURED_LINE = /^([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3}):\s+(.+)/;
// ---------------------------------------------------------------------------
// Parser strategies
// ---------------------------------------------------------------------------
function tryTimestamped(lines) {
    const messages = [];
    let currentMessage = null;
    for (const line of lines) {
        const match = line.match(TIMESTAMPED_LINE);
        if (match) {
            if (currentMessage)
                messages.push(currentMessage);
            currentMessage = {
                timestamp: match[1].trim(),
                speaker: match[2].trim(),
                text: match[3].trim(),
            };
        }
        else if (currentMessage && line.trim() !== '') {
            // Continuation line
            currentMessage.text += '\n' + line.trim();
        }
    }
    if (currentMessage)
        messages.push(currentMessage);
    // Need at least 2 timestamped messages to consider this format valid
    if (messages.length < 2)
        return null;
    const participants = uniqueParticipants(messages);
    return {
        messages,
        participants,
        normalizedContent: formatMessages(messages, true),
        format: 'timestamped',
    };
}
function tryStructured(lines) {
    const messages = [];
    let currentMessage = null;
    for (const line of lines) {
        const match = line.match(STRUCTURED_LINE);
        if (match) {
            if (currentMessage)
                messages.push(currentMessage);
            currentMessage = {
                speaker: match[1].trim(),
                text: match[2].trim(),
            };
        }
        else if (currentMessage && line.trim() !== '') {
            // Continuation line
            currentMessage.text += '\n' + line.trim();
        }
    }
    if (currentMessage)
        messages.push(currentMessage);
    // Need at least 2 structured messages to consider this format valid
    if (messages.length < 2)
        return null;
    const participants = uniqueParticipants(messages);
    return {
        messages,
        participants,
        normalizedContent: formatMessages(messages, false),
        format: 'structured',
    };
}
function parseRaw(text) {
    const trimmed = text.trim();
    if (trimmed === '') {
        return {
            messages: [],
            participants: [],
            normalizedContent: '',
            format: 'raw',
        };
    }
    // Split into paragraphs
    const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim() !== '');
    const messages = paragraphs.map((p) => ({
        speaker: 'Unknown',
        text: p.trim(),
    }));
    return {
        messages,
        participants: [],
        normalizedContent: paragraphs.map((p) => p.trim()).join('\n\n'),
        format: 'raw',
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uniqueParticipants(messages) {
    const seen = new Set();
    const ordered = [];
    for (const msg of messages) {
        if (msg.speaker !== 'Unknown' && !seen.has(msg.speaker)) {
            seen.add(msg.speaker);
            ordered.push(msg.speaker);
        }
    }
    return ordered;
}
function formatMessages(messages, includeTimestamp) {
    return messages
        .map((m) => {
        const prefix = includeTimestamp && m.timestamp ? `[${m.timestamp}] ` : '';
        return `**${m.speaker}**: ${prefix}${m.text}`;
    })
        .join('\n\n');
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse raw conversation text into structured messages with participant extraction.
 *
 * Uses a fallback chain:
 *   1. Structured with timestamps → 2. Structured without → 3. Raw paragraphs
 *
 * Never throws. Always returns a valid ParsedConversation.
 */
export function parseConversation(text) {
    if (!text || text.trim() === '') {
        return {
            messages: [],
            participants: [],
            normalizedContent: '',
            format: 'raw',
        };
    }
    const lines = text.split('\n');
    // Try timestamped first
    const timestamped = tryTimestamped(lines);
    if (timestamped)
        return timestamped;
    // Try structured (Name: message)
    const structured = tryStructured(lines);
    if (structured)
        return structured;
    // Fallback to raw paragraph splitting
    return parseRaw(text);
}
//# sourceMappingURL=parser.js.map