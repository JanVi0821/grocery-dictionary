"use client";

import { useEffect, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Bold, Italic, List, ListOrdered, Strikethrough } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./RichTextEditor.module.scss";

function toHexColor(color: string) {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].toLowerCase()}`;

  const rgb = color.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
  );
  if (!rgb) return "#163a3d";

  return `#${rgb
    .slice(1, 4)
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

const EDITOR_BODY_CLASS =
  "min-h-24 px-2 py-2 text-label leading-6 text-foreground outline-none [&_li]:ml-copy-gap [&_ol]:list-decimal [&_p+p]:mt-control-gap [&_ul]:list-disc";

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focus-ring grid size-9 place-items-center rounded-control text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
        active && "bg-surface-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  disabled,
  onChange,
  placeholder,
}: {
  disabled: boolean;
  onChange: (html: string) => void;
  placeholder: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        trailingNode: false,
        underline: false,
      }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        "aria-multiline": "true",
        class: EDITOR_BODY_CLASS,
        role: "textbox",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML());
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div className="overflow-hidden rounded-control border border-border bg-background">
        <div className="h-11 border-b border-border" />
        <div className="min-h-24" />
      </div>
    );
  }

  const activeColor = toHexColor(
    String(editor.getAttributes("textStyle").color ?? ""),
  );

  return (
    <div className={cn("overflow-hidden rounded-control border border-border bg-background focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background", styles.editor)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <ToolbarButton
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" aria-hidden="true" />
        </ToolbarButton>
        <input
          type="color"
          disabled={disabled}
          value={activeColor}
          onInput={(event) => {
            editor.chain().focus().setColor(event.currentTarget.value).run();
          }}
          className="ml-1 size-8 overflow-hidden cursor-pointer rounded-full bg-background p-1 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
