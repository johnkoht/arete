/**
 * Shared tokenizer for search and context injection.
 */

export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please',
  'want', 'need', 'create', 'build', 'start', 'run', 'do', 'help',
]);

/**
 * Tokenize text for search: lowercase, strip punctuation, split on whitespace,
 * filter stop words and single-character tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}
