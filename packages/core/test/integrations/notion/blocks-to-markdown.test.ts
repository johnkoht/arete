/**
 * Tests for blocks-to-markdown converter.
 *
 * Covers: rich text annotations, all Tier 1 block types, Tier 2 fallbacks,
 * unknown types, nested indentation, tables, and fixture-based integration tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blocksToMarkdown,
  richTextToMarkdown,
} from '../../../src/integrations/notion/blocks-to-markdown.js';
import type {
  FlatBlock,
  NotionRichText,
} from '../../../src/integrations/notion/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a minimal rich text segment */
function rt(
  content: string,
  annotations?: Partial<NotionRichText['annotations']>,
  link?: string
): NotionRichText {
  return {
    type: 'text',
    plain_text: content,
    href: link ?? null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
      ...annotations,
    },
    text: {
      content,
      link: link ? { url: link } : null,
    },
  };
}

/** Make a FlatBlock for testing */
function fb(
  type: string,
  richText: NotionRichText[],
  opts?: {
    depth?: number;
    id?: string;
    data?: Record<string, unknown>;
    hasChildren?: boolean;
  }
): FlatBlock {
  return {
    id: opts?.id ?? 'test-block-id',
    type,
    has_children: opts?.hasChildren ?? false,
    depth: opts?.depth ?? 0,
    data: opts?.data ?? {},
    rich_text: richText,
  };
}

// ---------------------------------------------------------------------------
// richTextToMarkdown
// ---------------------------------------------------------------------------

describe('richTextToMarkdown', () => {
  it('returns empty string for empty array', () => {
    assert.equal(richTextToMarkdown([]), '');
  });

  it('converts plain text', () => {
    assert.equal(richTextToMarkdown([rt('hello')]), 'hello');
  });

  it('converts bold text', () => {
    assert.equal(richTextToMarkdown([rt('bold', { bold: true })]), '**bold**');
  });

  it('converts italic text', () => {
    assert.equal(
      richTextToMarkdown([rt('italic', { italic: true })]),
      '*italic*'
    );
  });

  it('converts code text', () => {
    assert.equal(richTextToMarkdown([rt('code', { code: true })]), '`code`');
  });

  it('converts strikethrough text', () => {
    assert.equal(
      richTextToMarkdown([rt('struck', { strikethrough: true })]),
      '~~struck~~'
    );
  });

  it('converts links', () => {
    assert.equal(
      richTextToMarkdown([rt('click me', {}, 'https://example.com')]),
      '[click me](https://example.com)'
    );
  });

  it('handles bold + italic combined', () => {
    assert.equal(
      richTextToMarkdown([rt('both', { bold: true, italic: true })]),
      '***both***'
    );
  });

  it('handles bold + link combined', () => {
    assert.equal(
      richTextToMarkdown([
        rt('link', { bold: true }, 'https://example.com'),
      ]),
      '[**link**](https://example.com)'
    );
  });

  it('handles code annotation (no nested formatting)', () => {
    // Code takes priority — bold/italic should not wrap backticks
    assert.equal(
      richTextToMarkdown([rt('fn()', { code: true, bold: true })]),
      '`fn()`'
    );
  });

  it('concatenates multiple segments', () => {
    const result = richTextToMarkdown([
      rt('hello '),
      rt('world', { bold: true }),
      rt('!'),
    ]);
    assert.equal(result, 'hello **world**!');
  });
});

// ---------------------------------------------------------------------------
// Tier 1 block types
// ---------------------------------------------------------------------------

describe('blocksToMarkdown — Tier 1', () => {
  it('paragraph', () => {
    const md = blocksToMarkdown([fb('paragraph', [rt('Hello world')])]);
    assert.equal(md.trim(), 'Hello world');
  });

  it('empty paragraph produces blank line', () => {
    const md = blocksToMarkdown([
      fb('paragraph', [rt('Before')]),
      fb('paragraph', []),
      fb('paragraph', [rt('After')]),
    ]);
    assert.ok(md.includes('Before'));
    assert.ok(md.includes('After'));
  });

  it('heading_1', () => {
    const md = blocksToMarkdown([fb('heading_1', [rt('Title')])]);
    assert.equal(md.trim(), '# Title');
  });

  it('heading_2', () => {
    const md = blocksToMarkdown([fb('heading_2', [rt('Subtitle')])]);
    assert.equal(md.trim(), '## Subtitle');
  });

  it('heading_3', () => {
    const md = blocksToMarkdown([fb('heading_3', [rt('Section')])]);
    assert.equal(md.trim(), '### Section');
  });

  it('bulleted_list_item at depth 0', () => {
    const md = blocksToMarkdown([
      fb('bulleted_list_item', [rt('Item one')]),
      fb('bulleted_list_item', [rt('Item two')]),
    ]);
    assert.ok(md.includes('- Item one'));
    assert.ok(md.includes('- Item two'));
  });

  it('bulleted_list_item nested at depth 1 and 2', () => {
    const md = blocksToMarkdown([
      fb('bulleted_list_item', [rt('Top')], { depth: 0 }),
      fb('bulleted_list_item', [rt('Nested')], { depth: 1 }),
      fb('bulleted_list_item', [rt('Deep')], { depth: 2 }),
    ]);
    assert.ok(md.includes('- Top'));
    assert.ok(md.includes('  - Nested'));
    assert.ok(md.includes('    - Deep'));
  });

  it('numbered_list_item', () => {
    const md = blocksToMarkdown([
      fb('numbered_list_item', [rt('First')]),
      fb('numbered_list_item', [rt('Second')]),
    ]);
    assert.ok(md.includes('1. First'));
    assert.ok(md.includes('1. Second'));
  });

  it('numbered_list_item nested', () => {
    const md = blocksToMarkdown([
      fb('numbered_list_item', [rt('Top')], { depth: 0 }),
      fb('numbered_list_item', [rt('Sub')], { depth: 1 }),
    ]);
    assert.ok(md.includes('1. Top'));
    assert.ok(md.includes('  1. Sub'));
  });

  it('to_do checked', () => {
    const md = blocksToMarkdown([
      fb('to_do', [rt('Done task')], {
        data: { checked: true },
      }),
    ]);
    assert.ok(md.includes('- [x] Done task'));
  });

  it('to_do unchecked', () => {
    const md = blocksToMarkdown([
      fb('to_do', [rt('Open task')], {
        data: { checked: false },
      }),
    ]);
    assert.ok(md.includes('- [ ] Open task'));
  });

  it('to_do nested', () => {
    const md = blocksToMarkdown([
      fb('to_do', [rt('Parent')], { depth: 0, data: { checked: false } }),
      fb('to_do', [rt('Child')], { depth: 1, data: { checked: true } }),
    ]);
    assert.ok(md.includes('- [ ] Parent'));
    assert.ok(md.includes('  - [x] Child'));
  });

  it('code block with language', () => {
    const md = blocksToMarkdown([
      fb('code', [rt('const x = 1;')], {
        data: { language: 'typescript' },
      }),
    ]);
    assert.ok(md.includes('```typescript'));
    assert.ok(md.includes('const x = 1;'));
    assert.ok(md.includes('```'));
  });

  it('quote block', () => {
    const md = blocksToMarkdown([fb('quote', [rt('Wise words')])]);
    assert.ok(md.includes('> Wise words'));
  });

  it('divider', () => {
    const md = blocksToMarkdown([fb('divider', [])]);
    assert.ok(md.includes('---'));
  });

  it('image with external URL and caption', () => {
    const md = blocksToMarkdown([
      fb('image', [], {
        data: {
          external: { url: 'https://example.com/img.png' },
          caption: [rt('My image')],
        },
      }),
    ]);
    assert.ok(md.includes('![My image](https://example.com/img.png)'));
  });

  it('image with file URL', () => {
    const md = blocksToMarkdown([
      fb('image', [], {
        data: {
          file: { url: 'https://s3.example.com/img.png' },
          caption: [],
        },
      }),
    ]);
    assert.ok(md.includes('![](https://s3.example.com/img.png)'));
  });

  it('bookmark', () => {
    const md = blocksToMarkdown([
      fb('bookmark', [], {
        data: {
          url: 'https://docs.example.com',
          caption: [rt('Documentation')],
        },
      }),
    ]);
    assert.ok(md.includes('[Documentation](https://docs.example.com)'));
  });

  it('child_page', () => {
    const md = blocksToMarkdown([
      fb('child_page', [], {
        id: 'abc-def-123',
        data: { title: 'My Sub Page' },
      }),
    ]);
    assert.ok(md.includes('📄 [My Sub Page](https://notion.so/abcdef123)'));
  });

  it('child_database', () => {
    const md = blocksToMarkdown([
      fb('child_database', [], {
        id: 'db-abc-123',
        data: { title: 'My Database' },
      }),
    ]);
    assert.ok(md.includes('📊 [My Database](https://notion.so/dbabc123)'));
  });

  it('table with header row', () => {
    const headerRow = fb('table_row', [], {
      data: {
        cells: [[rt('Name')], [rt('Age')]],
      },
    });
    const dataRow = fb('table_row', [], {
      data: {
        cells: [[rt('Alice')], [rt('30')]],
      },
    });
    const md = blocksToMarkdown([
      fb('table', [], {
        data: { has_column_header: true, table_width: 2 },
        hasChildren: true,
      }),
      headerRow,
      dataRow,
    ]);
    assert.ok(md.includes('| Name | Age |'));
    assert.ok(md.includes('| --- | --- |'));
    assert.ok(md.includes('| Alice | 30 |'));
  });

  it('table without header', () => {
    const md = blocksToMarkdown([
      fb('table', [], {
        data: { has_column_header: false, table_width: 2 },
        hasChildren: true,
      }),
      fb('table_row', [], {
        data: { cells: [[rt('A')], [rt('B')]] },
      }),
      fb('table_row', [], {
        data: { cells: [[rt('C')], [rt('D')]] },
      }),
    ]);
    assert.ok(md.includes('| A | B |'));
    assert.ok(md.includes('| C | D |'));
    assert.ok(!md.includes('| --- | --- |'));
  });
});

// ---------------------------------------------------------------------------
// Tier 2 fallbacks
// ---------------------------------------------------------------------------

describe('blocksToMarkdown — Tier 2', () => {
  it('toggle renders as blockquote', () => {
    const md = blocksToMarkdown([fb('toggle', [rt('Click me')])]);
    assert.ok(md.includes('> **Toggle:** Click me'));
  });

  it('callout with emoji', () => {
    const md = blocksToMarkdown([
      fb('callout', [rt('Important!')], {
        data: { icon: { type: 'emoji', emoji: '⚠️' } },
      }),
    ]);
    assert.ok(md.includes('> ⚠️ **Callout:** Important!'));
  });

  it('callout without icon', () => {
    const md = blocksToMarkdown([
      fb('callout', [rt('Note')], { data: {} }),
    ]);
    assert.ok(md.includes('> **Callout:** Note'));
  });

  it('equation', () => {
    const md = blocksToMarkdown([
      fb('equation', [], { data: { expression: 'E=mc^2' } }),
    ]);
    assert.ok(md.includes('`E=mc^2`'));
  });

  it('embed', () => {
    const md = blocksToMarkdown([
      fb('embed', [], { data: { url: 'https://embed.example.com' } }),
    ]);
    assert.ok(md.includes('[Embed](https://embed.example.com)'));
  });

  it('file', () => {
    const md = blocksToMarkdown([
      fb('file', [], {
        data: { external: { url: 'https://example.com/doc.pdf' } },
      }),
    ]);
    assert.ok(md.includes('[File](https://example.com/doc.pdf)'));
  });

  it('audio', () => {
    const md = blocksToMarkdown([
      fb('audio', [], {
        data: { file: { url: 'https://example.com/song.mp3' } },
      }),
    ]);
    assert.ok(md.includes('[Audio](https://example.com/song.mp3)'));
  });

  it('video', () => {
    const md = blocksToMarkdown([
      fb('video', [], {
        data: { external: { url: 'https://youtube.com/watch?v=abc' } },
      }),
    ]);
    assert.ok(md.includes('[Video](https://youtube.com/watch?v=abc)'));
  });

  it('breadcrumb → HTML comment', () => {
    const md = blocksToMarkdown([fb('breadcrumb', [])]);
    assert.ok(md.includes('<!-- breadcrumb -->'));
  });

  it('table_of_contents → HTML comment', () => {
    const md = blocksToMarkdown([fb('table_of_contents', [])]);
    assert.ok(md.includes('<!-- table_of_contents -->'));
  });

  it('link_preview → HTML comment', () => {
    const md = blocksToMarkdown([fb('link_preview', [])]);
    assert.ok(md.includes('<!-- link_preview -->'));
  });

  it('column_list with no text returns nothing (structural)', () => {
    const md = blocksToMarkdown([
      fb('column_list', []),
      fb('paragraph', [rt('Content inside column')]),
    ]);
    assert.ok(md.includes('Content inside column'));
  });

  it('synced_block is structural passthrough', () => {
    const md = blocksToMarkdown([
      fb('synced_block', []),
      fb('paragraph', [rt('Synced content')]),
    ]);
    assert.ok(md.includes('Synced content'));
  });
});

// ---------------------------------------------------------------------------
// Unknown types
// ---------------------------------------------------------------------------

describe('blocksToMarkdown — unknown types', () => {
  it('unknown type produces placeholder comment', () => {
    const md = blocksToMarkdown([fb('fancy_widget', [])]);
    assert.ok(md.includes('<!-- Unsupported block type: fancy_widget -->'));
  });
});

// ---------------------------------------------------------------------------
// Depth / indentation edge cases
// ---------------------------------------------------------------------------

describe('blocksToMarkdown — depth handling', () => {
  it('headings ignore depth', () => {
    const md = blocksToMarkdown([
      fb('heading_1', [rt('H1')], { depth: 2 }),
    ]);
    assert.ok(md.includes('# H1'));
    assert.ok(!md.includes('  # H1'));
  });

  it('divider ignores depth', () => {
    const md = blocksToMarkdown([fb('divider', [], { depth: 1 })]);
    assert.equal(md.trim(), '---');
  });

  it('paragraph at depth > 0 is indented', () => {
    const md = blocksToMarkdown([
      fb('paragraph', [rt('Nested text')], { depth: 1 }),
    ]);
    assert.ok(md.includes('  Nested text'));
  });
});

// ---------------------------------------------------------------------------
// Fixture-based integration tests
// ---------------------------------------------------------------------------

function loadFixture(name: string): Record<string, unknown> {
  const fixturePath = join(
    import.meta.dirname,
    'fixtures',
    `${name}.json`
  );
  return JSON.parse(readFileSync(fixturePath, 'utf-8')) as Record<string, unknown>;
}

type RawBlock = {
  id: string;
  type: string;
  has_children: boolean;
  parent?: { type: string; block_id: string };
  [key: string]: unknown;
};

/**
 * Convert fixture blocks into FlatBlock[].
 * Fixture blocks are in document order. We infer depth from parent relationships:
 * top-level blocks have no parent.block_id in the fixture, children reference their parent.
 */
function fixtureToFlatBlocks(rawBlocks: RawBlock[]): FlatBlock[] {
  // Build a parent → depth map. Blocks without a parent block_id are depth 0.
  const depthMap = new Map<string, number>();

  // First pass: assign depths
  for (const block of rawBlocks) {
    const parentBlockId = block.parent?.type === 'block_id' ? block.parent.block_id : null;
    if (parentBlockId && depthMap.has(parentBlockId)) {
      depthMap.set(block.id, depthMap.get(parentBlockId)! + 1);
    } else if (parentBlockId) {
      // Parent exists but hasn't been seen yet — scan ahead
      depthMap.set(block.id, -1); // placeholder
    } else {
      depthMap.set(block.id, 0);
    }
  }

  // Second pass: resolve placeholders
  for (const block of rawBlocks) {
    if (depthMap.get(block.id) === -1) {
      const parentBlockId = (block.parent as { block_id: string }).block_id;
      const parentDepth = depthMap.get(parentBlockId) ?? 0;
      depthMap.set(block.id, parentDepth + 1);
    }
  }

  return rawBlocks.map((block) => {
    const blockType = block.type;
    const typeData = (block[blockType] ?? {}) as Record<string, unknown>;
    const richText = (typeData.rich_text ?? []) as NotionRichText[];

    return {
      id: block.id,
      type: blockType,
      has_children: block.has_children,
      depth: depthMap.get(block.id) ?? 0,
      data: typeData,
      rich_text: richText,
    };
  });
}

describe('fixture: simple-page', () => {
  it('produces expected markdown for headings, paragraphs, lists, link, divider', () => {
    const fixture = loadFixture('simple-page');
    const blocks = fixtureToFlatBlocks(
      (fixture.blocks as RawBlock[])
    );
    const md = blocksToMarkdown(blocks);

    // Heading 1
    assert.ok(md.includes('# Overview'));
    // Bold text in paragraph
    assert.ok(md.includes('**product requirements**'));
    // Heading 2
    assert.ok(md.includes('## Goals'));
    // Bullet items
    assert.ok(md.includes('- Reduce time-to-value for new users'));
    assert.ok(md.includes('**40% to 65%**'));
    // Divider
    assert.ok(md.includes('---'));
    // Link
    assert.ok(md.includes('[design spec](https://figma.com/example)'));
  });
});

describe('fixture: mixed-blocks-page', () => {
  it('produces markdown for 20 block types', () => {
    const fixture = loadFixture('mixed-blocks-page');
    const blocks = fixtureToFlatBlocks(
      (fixture.blocks as RawBlock[])
    );
    const md = blocksToMarkdown(blocks);

    // Heading
    assert.ok(md.includes('# System Design'));
    // Bold + italic in paragraph
    assert.ok(md.includes('**microservices**'));
    assert.ok(md.includes('*event-driven*'));
    // Numbered list
    assert.ok(md.includes('1. API Gateway'));
    // Code block with language
    assert.ok(md.includes('```typescript'));
    assert.ok(md.includes('const config = {'));
    // Quote
    assert.ok(md.includes('> Design for failure'));
    // To-do checked
    assert.ok(md.includes('- [x] Set up CI/CD pipeline'));
    // To-do unchecked
    assert.ok(md.includes('- [ ] Configure monitoring'));
    // Table
    assert.ok(md.includes('| Field | Type | Description |'));
    assert.ok(md.includes('| --- | --- | --- |'));
    assert.ok(md.includes('`id`'));
    // Image
    assert.ok(
      md.includes(
        '![System Architecture Diagram](https://example.com/architecture-diagram.png)'
      )
    );
    // Bookmark
    assert.ok(
      md.includes(
        '[API Reference Documentation](https://docs.example.com/api-reference)'
      )
    );
    // Callout with emoji
    assert.ok(md.includes('⚠️ **Callout:**'));
    // Child page
    assert.ok(md.includes('📄 [Deployment Guide]'));
    // Child database
    assert.ok(md.includes('📊 [Service Registry]'));
    // Code annotation + strikethrough in paragraph
    assert.ok(md.includes('`fetchData()`'));
    assert.ok(md.includes('~~caution~~'));
  });
});

describe('fixture: nested-blocks-page', () => {
  it('produces correct indentation for 3-level nested lists', () => {
    const fixture = loadFixture('nested-blocks-page');
    const blocks = fixtureToFlatBlocks(
      (fixture.blocks as RawBlock[])
    );
    const md = blocksToMarkdown(blocks);

    // Top-level bullet
    assert.ok(md.includes('- **Product updates**'));
    // Depth 1 nested bullet
    assert.ok(md.includes('  - Feature A progress'));
    // Depth 2 nested bullet
    assert.ok(md.includes('    - Backend API complete'));
    assert.ok(md.includes('    - Frontend in review'));
    // Depth 1 sibling
    assert.ok(md.includes('  - Feature B kickoff'));
    // Another top-level bullet
    assert.ok(md.includes('- **Engineering standup**'));
  });

  it('renders to_do with children', () => {
    const fixture = loadFixture('nested-blocks-page');
    const blocks = fixtureToFlatBlocks(
      (fixture.blocks as RawBlock[])
    );
    const md = blocksToMarkdown(blocks);

    assert.ok(md.includes('- [ ] Schedule design review'));
    // Child paragraph under to_do (depth 1, italic)
    assert.ok(md.includes('*Need to include both design and engineering leads*'));
    assert.ok(md.includes('- [x] Update roadmap'));
  });

  it('renders toggle with child content', () => {
    const fixture = loadFixture('nested-blocks-page');
    const blocks = fixtureToFlatBlocks(
      (fixture.blocks as RawBlock[])
    );
    const md = blocksToMarkdown(blocks);

    assert.ok(md.includes('> **Toggle:** Previous meeting notes'));
    assert.ok(md.includes('migration timeline'));
  });
});
