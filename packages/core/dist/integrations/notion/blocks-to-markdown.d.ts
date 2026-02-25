/**
 * Blocks-to-Markdown converter.
 *
 * Converts a flat list of FlatBlock[] (from getAllPageBlocks) into clean
 * markdown. Processing is strictly iterative — no recursive function calls.
 */
import type { FlatBlock, NotionRichText } from './types.js';
/**
 * Convert a Notion rich text array to a markdown string with annotations.
 * Handles: bold, italic, code, strikethrough, links. Combined annotations
 * are supported (e.g. bold+italic → ***text***).
 */
export declare function richTextToMarkdown(richText: NotionRichText[]): string;
/**
 * Convert a flat block list to markdown. Single iterative pass.
 */
export declare function blocksToMarkdown(blocks: FlatBlock[]): string;
//# sourceMappingURL=blocks-to-markdown.d.ts.map