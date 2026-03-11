/**
 * Shared tokenizer for search and context injection.
 */
export declare const STOP_WORDS: Set<string>;
/**
 * Tokenize text for search: lowercase, strip punctuation, split on whitespace,
 * filter stop words and single-character tokens.
 */
export declare function tokenize(text: string): string[];
//# sourceMappingURL=tokenize.d.ts.map