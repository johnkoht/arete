/**
 * Blocks-to-Markdown converter.
 *
 * Converts a flat list of FlatBlock[] (from getAllPageBlocks) into clean
 * markdown. Processing is strictly iterative — no recursive function calls.
 */

import type { FlatBlock, NotionRichText } from './types.js';

// ---------------------------------------------------------------------------
// Rich text → markdown
// ---------------------------------------------------------------------------

/**
 * Convert a Notion rich text array to a markdown string with annotations.
 * Handles: bold, italic, code, strikethrough, links. Combined annotations
 * are supported (e.g. bold+italic → ***text***).
 */
export function richTextToMarkdown(richText: NotionRichText[]): string {
  if (!richText || richText.length === 0) return '';

  return richText
    .map((segment) => {
      let text = segment.plain_text;
      if (!text) return '';

      const { bold, italic, strikethrough, code } = segment.annotations;
      const link = segment.href ?? segment.text?.link?.url ?? null;

      // Code annotation is innermost — markdown doesn't nest inside backticks
      if (code) {
        text = `\`${text}\``;
      } else {
        // Apply decorations inside-out: strikethrough, then bold/italic
        if (strikethrough) text = `~~${text}~~`;
        if (bold && italic) {
          text = `***${text}***`;
        } else if (bold) {
          text = `**${text}**`;
        } else if (italic) {
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
// Table state tracker
// ---------------------------------------------------------------------------

type TableState = {
  hasColumnHeader: boolean;
  tableWidth: number;
  rowIndex: number;
};

// ---------------------------------------------------------------------------
// Block → markdown line(s)
// ---------------------------------------------------------------------------

/**
 * Convert a flat block list to markdown. Single iterative pass.
 */
export function blocksToMarkdown(blocks: FlatBlock[]): string {
  const lines: string[] = [];
  let tableState: TableState | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const { type, depth } = block;

    // Table block starts a table context
    if (type === 'table') {
      const tableData = block.data as {
        has_column_header?: boolean;
        table_width?: number;
      };
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
        const rowData = block.data as {
          cells?: NotionRichText[][];
        };
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

function convertBlock(block: FlatBlock, depth: number): string | null {
  const { type } = block;
  const text = richTextToMarkdown(block.rich_text);

  switch (type) {
    // ----- Tier 1: Must produce correct markdown -----

    case 'paragraph':
      if (!text) return '';
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
      const todoData = block.data as { checked?: boolean };
      const checkbox = todoData.checked ? '[x]' : '[ ]';
      return `${'  '.repeat(depth)}- ${checkbox} ${text}`;
    }

    case 'code': {
      const codeData = block.data as { language?: string };
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
      const imgData = block.data as {
        external?: { url: string };
        file?: { url: string };
        caption?: NotionRichText[];
      };
      const imgUrl =
        imgData.external?.url ?? imgData.file?.url ?? '';
      const caption = imgData.caption
        ? richTextToMarkdown(imgData.caption)
        : '';
      return `![${caption}](${imgUrl})`;
    }

    case 'bookmark': {
      const bmData = block.data as {
        url?: string;
        caption?: NotionRichText[];
      };
      const bmUrl = bmData.url ?? '';
      const bmCaption = bmData.caption
        ? richTextToMarkdown(bmData.caption)
        : bmUrl;
      return `[${bmCaption}](${bmUrl})`;
    }

    case 'child_page': {
      const cpData = block.data as { title?: string };
      const pageId = block.id.replace(/-/g, '');
      return `📄 [${cpData.title ?? 'Untitled'}](https://notion.so/${pageId})`;
    }

    case 'child_database': {
      const cdData = block.data as { title?: string };
      const dbId = block.id.replace(/-/g, '');
      return `📊 [${cdData.title ?? 'Untitled'}](https://notion.so/${dbId})`;
    }

    // ----- Tier 2: Graceful fallback -----

    case 'toggle':
      return `> **Toggle:** ${text}`;

    case 'callout': {
      const coData = block.data as {
        icon?: { type: string; emoji?: string };
      };
      const emoji = coData.icon?.type === 'emoji' ? `${coData.icon.emoji} ` : '';
      return `> ${emoji}**Callout:** ${text}`;
    }

    case 'column_list':
    case 'column':
    case 'synced_block':
      // Structural blocks — text extracted from children in flat list
      return text ? text : null;

    case 'equation': {
      const eqData = block.data as { expression?: string };
      return `\`${eqData.expression ?? text}\``;
    }

    case 'embed': {
      const embedData = block.data as { url?: string };
      return `[Embed](${embedData.url ?? ''})`;
    }

    case 'file': {
      const fileData = block.data as {
        external?: { url: string };
        file?: { url: string };
      };
      const fileUrl = fileData.external?.url ?? fileData.file?.url ?? '';
      return `[File](${fileUrl})`;
    }

    case 'audio': {
      const audioData = block.data as {
        external?: { url: string };
        file?: { url: string };
      };
      const audioUrl = audioData.external?.url ?? audioData.file?.url ?? '';
      return `[Audio](${audioUrl})`;
    }

    case 'video': {
      const videoData = block.data as {
        external?: { url: string };
        file?: { url: string };
      };
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
