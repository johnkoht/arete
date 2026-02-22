/**
 * Notion integration types.
 *
 * Areté-specific types only — no SDK imports.
 * This is a thin fetch integration, not SDK-based.
 */

/** Rich text element from Notion API */
export type NotionRichText = {
  type: 'text' | 'mention' | 'equation';
  plain_text: string;
  href: string | null;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  text?: {
    content: string;
    link: { url: string } | null;
  };
  mention?: {
    type: string;
    page?: { id: string };
    database?: { id: string };
    user?: { id: string; name?: string };
    date?: { start: string; end: string | null };
  };
  equation?: {
    expression: string;
  };
};

/** Flat block for iterative processing (no recursive children) */
export type FlatBlock = {
  id: string;
  type: string;
  has_children: boolean;
  depth: number;
  /** Block-type-specific data, keyed by type name */
  data: Record<string, unknown>;
  /** Convenience: extracted rich_text array if present */
  rich_text: NotionRichText[];
};

/** Page metadata + markdown content */
export type NotionPageResult = {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  markdown: string;
  properties: Record<string, unknown>;
};

/** Result of a pull operation */
export type NotionPullResult = {
  saved: string[];
  skipped: string[];
  errors: Array<{ pageId: string; error: string }>;
};

/** Options for a Notion pull operation */
export type NotionPullOptions = {
  pages: string[];
  destination: string;
};
