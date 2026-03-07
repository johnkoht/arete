/**
 * MarkdownEditor — TipTap-based WYSIWYG markdown editor.
 * Supports markdown input shortcuts (StarterKit), bubble menu for formatting,
 * and read-only rendering of markdown content.
 */

import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Heading2, Heading3, Code } from 'lucide-react';

type MarkdownEditorProps = {
  initialValue: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
};

export function MarkdownEditor({
  initialValue,
  onChange,
  placeholder = 'Start writing...',
  readOnly = false,
  className = '',
}: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder }),
    ],
    content: initialValue,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  if (!editor) return null;

  return (
    <div className={`relative ${className}`}>
      {!readOnly && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="flex items-center gap-1 rounded-md border bg-background shadow-md p-1">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-1 rounded text-xs ${editor.isActive('bold') ? 'bg-accent' : 'hover:bg-accent'}`}
            >
              <Bold className="h-3 w-3" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-1 rounded text-xs ${editor.isActive('italic') ? 'bg-accent' : 'hover:bg-accent'}`}
            >
              <Italic className="h-3 w-3" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`p-1 rounded text-xs ${editor.isActive('heading', { level: 2 }) ? 'bg-accent' : 'hover:bg-accent'}`}
            >
              <Heading2 className="h-3 w-3" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`p-1 rounded text-xs ${editor.isActive('heading', { level: 3 }) ? 'bg-accent' : 'hover:bg-accent'}`}
            >
              <Heading3 className="h-3 w-3" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={`p-1 rounded text-xs ${editor.isActive('code') ? 'bg-accent' : 'hover:bg-accent'}`}
            >
              <Code className="h-3 w-3" />
            </button>
          </div>
        </BubbleMenu>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none focus:outline-none"
      />
    </div>
  );
}
