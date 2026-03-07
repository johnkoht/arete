/**
 * BlockEditor — BlockNote-based Notion-like markdown editor.
 * Wraps BlockNote with markdown import/export for clean file persistence.
 *
 * Exports:
 * - BlockEditor: the editor component (for direct import)
 * - LazyBlockEditor: React.lazy() wrapped version (for dynamic import)
 *
 * Consumers should use LazyBlockEditor with <Suspense fallback={...}> for code splitting.
 */

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import type { PartialBlock } from '@blocknote/core';
import { useCallback, useEffect, useRef, lazy } from 'react';

export type BlockEditorProps = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
  className?: string;
};

/**
 * Convert BlockNote blocks to markdown string.
 * Uses the built-in blocksToMarkdownLossy which handles most cases.
 */
async function blocksToMarkdown(
  editor: ReturnType<typeof useCreateBlockNote>
): Promise<string> {
  const blocks = editor.document;
  return await editor.blocksToMarkdownLossy(blocks);
}

/**
 * Convert markdown string to BlockNote blocks.
 */
async function markdownToBlocks(
  editor: ReturnType<typeof useCreateBlockNote>,
  markdown: string
): Promise<PartialBlock[]> {
  return await editor.tryParseMarkdownToBlocks(markdown);
}

export function BlockEditor({
  initialMarkdown,
  onChange,
  editable = true,
  className = '',
}: BlockEditorProps) {
  const isInitializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the editor instance
  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: 'block-editor-root',
      },
    },
  });

  // Initialize content from markdown on mount
  useEffect(() => {
    if (!editor || isInitializedRef.current) return;

    async function initContent() {
      if (initialMarkdown && initialMarkdown.trim()) {
        try {
          const blocks = await markdownToBlocks(editor, initialMarkdown);
          if (blocks.length > 0) {
            editor.replaceBlocks(editor.document, blocks);
          }
        } catch (err) {
          console.error('Failed to parse markdown:', err);
        }
      }
      isInitializedRef.current = true;
    }

    initContent();
  }, [editor, initialMarkdown]);

  // Handle content changes - convert to markdown and call onChange
  const handleChange = useCallback(async () => {
    if (!isInitializedRef.current) return;
    
    try {
      const md = await blocksToMarkdown(editor);
      onChangeRef.current(md);
    } catch (err) {
      console.error('Failed to convert to markdown:', err);
    }
  }, [editor]);

  return (
    <div className={`block-editor-wrapper ${className}`} data-theme="dark">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="dark"
        // Disable file toolbar as we don't support file uploads
        formattingToolbar={true}
        slashMenu={editable}
      />
      <style>{`
        .block-editor-wrapper {
          /* Map BlockNote variables to shadcn CSS variables (see src/index.css) */
          --bn-colors-editor-background: hsl(var(--background));
          --bn-colors-editor-text: hsl(var(--foreground));
          --bn-colors-menu-background: hsl(var(--card));
          --bn-colors-menu-text: hsl(var(--card-foreground));
          --bn-colors-tooltip-background: hsl(var(--secondary));
          --bn-colors-tooltip-text: hsl(var(--secondary-foreground));
          --bn-colors-hovered-background: hsl(var(--accent));
          --bn-colors-selected-background: hsl(var(--primary) / 0.2);
          --bn-colors-disabled-background: hsl(var(--secondary));
          --bn-colors-disabled-text: hsl(var(--muted-foreground));
          --bn-colors-border: hsl(var(--border));
          --bn-colors-side-menu: hsl(var(--muted-foreground));
          --bn-colors-highlights-gray-background: hsl(var(--border));
          --bn-colors-highlights-gray-text: hsl(var(--foreground));
        }
        
        .block-editor-wrapper .bn-editor {
          padding: 0;
        }
        
        .block-editor-wrapper .bn-block-group {
          padding-left: 0;
        }
        
        .block-editor-wrapper [data-content-editable-leaf] {
          font-size: 0.875rem;
          line-height: 1.5;
        }
        
        .block-editor-wrapper h1[data-level="1"] {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        
        .block-editor-wrapper h2[data-level="2"] {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        
        .block-editor-wrapper h3[data-level="3"] {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
        }

        /* Placeholder styling */
        .block-editor-wrapper .bn-editor [data-placeholder]::before {
          color: hsl(215 15% 55%);
          font-style: normal;
        }
        
        /* Side menu (drag handles, etc) */
        .block-editor-wrapper .bn-side-menu {
          opacity: 0.5;
        }
        
        .block-editor-wrapper .bn-side-menu:hover {
          opacity: 1;
        }
        
        /* When read-only, hide the side menu entirely */
        .block-editor-wrapper:has([data-editable="false"]) .bn-side-menu {
          display: none;
        }
        
        /* Make inline content use prose sizing */
        .block-editor-wrapper .bn-inline-content {
          font-size: inherit;
        }
      `}</style>
    </div>
  );
}

/**
 * Lazy-loaded version of BlockEditor for code splitting.
 * Usage:
 *   import { LazyBlockEditor } from '@/components/BlockEditor.js';
 *   <Suspense fallback={<Skeleton />}>
 *     <LazyBlockEditor ... />
 *   </Suspense>
 */
export const LazyBlockEditor = lazy(() =>
  import('./BlockEditor.js').then((mod) => ({ default: mod.BlockEditor }))
);
