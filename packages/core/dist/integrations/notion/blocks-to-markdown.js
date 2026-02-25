/**
 * Blocks-to-Markdown converter.
 *
 * Converts a flat list of FlatBlock[] (from getAllPageBlocks) into clean
 * markdown. Processing is strictly iterative — no recursive function calls.
 */
// ---------------------------------------------------------------------------
// Rich text → markdown
// ---------------------------------------------------------------------------
/**
 * Convert a Notion rich text array to a markdown string with annotations.
 * Handles: bold, italic, code, strikethrough, links. Combined annotations
 * are supported (e.g. bold+italic → ***text***).
 */
export function richTextToMarkdown(richText) {
    if (!richText || richText.length === 0)
        return '';
    return richText
        .map((segment) => {
        let text = segment.plain_text;
        if (!text)
            return '';
        const { bold, italic, strikethrough, code } = segment.annotations;
        const link = segment.href ?? segment.text?.link?.url ?? null;
        // Code annotation is innermost — markdown doesn't nest inside backticks
        if (code) {
            text = `\`${text}\``;
        }
        else {
            // Apply decorations inside-out: strikethrough, then bold/italic
            if (strikethrough)
                text = `~~${text}~~`;
            if (bold && italic) {
                text = `***${text}***`;
            }
            else if (bold) {
                text = `**${text}**`;
            }
            else if (italic) {
                text = `*${text}*`;
            }
        }
        // Links wrap the whole thing
        if (link) {
            text = `[${text}](${link})`;
        }
        return text;
    })
        .join('');
}
// ---------------------------------------------------------------------------
// Block → markdown line(s)
// ---------------------------------------------------------------------------
/**
 * Convert a flat block list to markdown. Single iterative pass.
 */
export function blocksToMarkdown(blocks) {
    const lines = [];
    let tableState = null;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const { type, depth } = block;
        // Table block starts a table context
        if (type === 'table') {
            const tableData = block.data;
            tableState = {
                hasColumnHeader: tableData.has_column_header ?? false,
                tableWidth: tableData.table_width ?? 0,
                rowIndex: 0,
            };
            continue;
        }
        // Table rows are processed within table context
        if (type === 'table_row') {
            if (tableState) {
                const rowData = block.data;
                const cells = rowData.cells ?? [];
                // Defensive check: handle undefined/malformed cells gracefully
                const cellTexts = cells.map((cell) => (cell ? richTextToMarkdown(cell) : ''));
                lines.push(`| ${cellTexts.join(' | ')} |`);
                // Add separator after header row
                if (tableState.rowIndex === 0 && tableState.hasColumnHeader) {
                    const separator = cells.map(() => '---').join(' | ');
                    lines.push(`| ${separator} |`);
                }
                tableState.rowIndex++;
            }
            continue;
        }
        // If we were in a table and hit a non-table-row, close the table
        if (tableState) {
            tableState = null;
            lines.push('');
        }
        const md = convertBlock(block, depth);
        if (md !== null) {
            lines.push(md);
        }
    }
    // Clean up: join lines, collapse excessive blank lines, trim trailing whitespace
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
}
// ---------------------------------------------------------------------------
// Individual block conversion
// ---------------------------------------------------------------------------
function convertBlock(block, depth) {
    const { type } = block;
    const text = richTextToMarkdown(block.rich_text);
    switch (type) {
        // ----- Tier 1: Must produce correct markdown -----
        case 'paragraph':
            if (!text)
                return '';
            return depth > 0 ? `${'  '.repeat(depth)}${text}` : text;
        case 'heading_1':
            return `# ${text}`;
        case 'heading_2':
            return `## ${text}`;
        case 'heading_3':
            return `### ${text}`;
        case 'bulleted_list_item':
            return `${'  '.repeat(depth)}- ${text}`;
        case 'numbered_list_item':
            return `${'  '.repeat(depth)}1. ${text}`;
        case 'to_do': {
            const todoData = block.data;
            const checkbox = todoData.checked ? '[x]' : '[ ]';
            return `${'  '.repeat(depth)}- ${checkbox} ${text}`;
        }
        case 'code': {
            const codeData = block.data;
            const lang = codeData.language ?? '';
            return `\`\`\`${lang}\n${text}\n\`\`\``;
        }
        case 'quote': {
            const quotedLines = text.split('\n').map((line) => `> ${line}`);
            return quotedLines.join('\n');
        }
        case 'divider':
            return '---';
        case 'image': {
            const imgData = block.data;
            const imgUrl = imgData.external?.url ?? imgData.file?.url ?? '';
            const caption = imgData.caption
                ? richTextToMarkdown(imgData.caption)
                : '';
            return `![${caption}](${imgUrl})`;
        }
        case 'bookmark': {
            const bmData = block.data;
            const bmUrl = bmData.url ?? '';
            const bmCaption = bmData.caption
                ? richTextToMarkdown(bmData.caption)
                : bmUrl;
            return `[${bmCaption}](${bmUrl})`;
        }
        case 'child_page': {
            const cpData = block.data;
            const pageId = block.id.replace(/-/g, '');
            return `📄 [${cpData.title ?? 'Untitled'}](https://notion.so/${pageId})`;
        }
        case 'child_database': {
            const cdData = block.data;
            const dbId = block.id.replace(/-/g, '');
            return `📊 [${cdData.title ?? 'Untitled'}](https://notion.so/${dbId})`;
        }
        // ----- Tier 2: Graceful fallback -----
        case 'toggle':
            return `> **Toggle:** ${text}`;
        case 'callout': {
            const coData = block.data;
            const emoji = coData.icon?.type === 'emoji' ? `${coData.icon.emoji} ` : '';
            return `> ${emoji}**Callout:** ${text}`;
        }
        case 'column_list':
        case 'column':
        case 'synced_block':
            // Structural blocks — text extracted from children in flat list
            return text ? text : null;
        case 'equation': {
            const eqData = block.data;
            return `\`${eqData.expression ?? text}\``;
        }
        case 'embed': {
            const embedData = block.data;
            return `[Embed](${embedData.url ?? ''})`;
        }
        case 'file': {
            const fileData = block.data;
            const fileUrl = fileData.external?.url ?? fileData.file?.url ?? '';
            return `[File](${fileUrl})`;
        }
        case 'audio': {
            const audioData = block.data;
            const audioUrl = audioData.external?.url ?? audioData.file?.url ?? '';
            return `[Audio](${audioUrl})`;
        }
        case 'video': {
            const videoData = block.data;
            const videoUrl = videoData.external?.url ?? videoData.file?.url ?? '';
            return `[Video](${videoUrl})`;
        }
        case 'breadcrumb':
        case 'table_of_contents':
        case 'link_preview':
            return `<!-- ${type} -->`;
        // ----- Unknown -----
        default:
            return `<!-- Unsupported block type: ${type} -->`;
    }
}
//# sourceMappingURL=blocks-to-markdown.js.map