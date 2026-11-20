"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { buildImageUrl } from "@/infrastructure/cloudinary/images";
import { safeHref } from "@/modules/content/document";
import { ImagePicker, type PickerActions, type PickerImage } from "./image-picker";
import { ProductEmbed, withEmbedLabels } from "./product-embed-extension";
import { ProductPicker, type ProductPickerItem, type ProductSearch } from "./product-picker";

/**
 * The article editor (Tiptap). It can only produce the whitelisted document (see modules/content/document.ts):
 * paragraphs, headings 2 to 4, bold, italic, links, two kinds of list, quotes, pictures from the media library and (Release 6B,
 * articles only) product blocks that hold just a product id.
 * The document is kept as JSON in a hidden field, and the server rebuilds it through the whitelist again on save.
 */

/** A picture node that stores the library id and description only; its address is built from the id. */
function libraryImage(cloudName: string) {
  return Image.extend({
    addAttributes() {
      return {
        publicId: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("data-public-id") },
        alt: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("alt") ?? "" },
        width: { default: null },
        height: { default: null },
      };
    },
    parseHTML() {
      return [{ tag: "img[data-public-id]" }];
    },
    renderHTML({ node }) {
      const publicId = String(node.attrs.publicId ?? "");
      return ["img", { src: publicId ? buildImageUrl(cloudName, publicId, "card") : "", alt: String(node.attrs.alt ?? ""), "data-public-id": publicId }];
    },
  });
}

type Props = PickerActions & {
  /** Name of the hidden field that carries the document to the server. */
  name: string;
  initial: unknown;
  cloudName: string | null;
  uploadsEnabled: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Release 6B: when given, the toolbar offers a "Product" button. Pages do not pass it. */
  searchProducts?: ProductSearch;
  /** Product id -> name, so embeds already in the text show a name. */
  productLabels?: Record<string, string>;
};

const EMPTY = { type: "doc", content: [] };
const tool = "rounded-lg border border-cream-200 px-2.5 py-1.5 text-sm hover:bg-forest-100 disabled:opacity-50 aria-pressed:bg-forest-800 aria-pressed:text-cream-50";

function Toolbar({ editor, onImage, canImage, onProduct }: { editor: Editor; onImage: () => void; canImage: boolean; onProduct?: () => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  function openLink() {
    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }
  function applyLink() {
    if (href.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return setLinkOpen(false);
    }
    const clean = safeHref(href);
    if (!clean) return setLinkError("Use a full address starting with https://, a mailto: address, or a path on this site starting with /.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
    setLinkOpen(false);
  }

  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap gap-1.5">
        <button type="button" className={tool} aria-pressed={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong><span className="sr-only"> Bold</span></button>
        <button type="button" className={tool} aria-pressed={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em><span className="sr-only"> Italic</span></button>
        <button type="button" className={tool} aria-pressed={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading</button>
        <button type="button" className={tool} aria-pressed={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>Subheading</button>
        <button type="button" className={tool} aria-pressed={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>Bullets</button>
        <button type="button" className={tool} aria-pressed={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>Numbers</button>
        <button type="button" className={tool} aria-pressed={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
        <button type="button" className={tool} aria-pressed={editor.isActive("link")} onClick={openLink}>Link</button>
        <button type="button" className={tool} onClick={onImage} disabled={!canImage}>Picture</button>
        {onProduct && <button type="button" className={tool} onClick={onProduct}>Product</button>}
        <button type="button" className={tool} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>Undo</button>
        <button type="button" className={tool} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>Redo</button>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-cream-200 bg-cream-50 p-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="link-href" className="block text-xs text-ink-600">Link address (leave empty to remove the link)</label>
            <input id="link-href" value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} className="mt-1 w-full rounded-xl border border-cream-200 bg-white px-3 py-2 text-sm" autoCapitalize="none" spellCheck={false} />
          </div>
          <button type="button" onClick={applyLink} className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-medium text-cream-50">Apply</button>
          <button type="button" onClick={() => setLinkOpen(false)} className="text-sm text-ink-600 underline">Cancel</button>
          {linkError && <p role="alert" className="w-full text-sm text-coral-600">{linkError}</p>}
        </div>
      )}
    </div>
  );
}

export function RichTextEditor({ name, initial, cloudName, uploadsEnabled, invalid, describedBy, search, sign, record, searchProducts, productLabels }: Props) {
  const [json, setJson] = useState(() => JSON.stringify(initial ?? EMPTY));
  const [picking, setPicking] = useState(false);
  const [pickingProduct, setPickingProduct] = useState(false);
  const [startDoc] = useState(() => withEmbedLabels(initial ?? EMPTY, productLabels ?? {}));
  const [mounted, setMounted] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, code: false, codeBlock: false, strike: false, horizontalRule: false }),
      Link.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      libraryImage(cloudName ?? ""),
      ...(searchProducts ? [ProductEmbed] : []),
    ],
    content: (startDoc as object | null) ?? EMPTY,
    editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Article text", class: "min-h-72 rounded-b-xl bg-white px-4 py-3 text-base leading-relaxed focus:outline-none [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-2xl [&_h3]:text-xl [&_img]:my-3 [&_img]:max-w-sm [&_[data-product-embed]]:my-3 [&_[data-product-embed]]:rounded-xl [&_[data-product-embed]]:border [&_[data-product-embed]]:border-dashed [&_[data-product-embed]]:border-forest-800 [&_[data-product-embed]]:bg-forest-100 [&_[data-product-embed]]:px-3 [&_[data-product-embed]]:py-2 [&_[data-product-embed]]:text-sm [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6" } },
    onCreate: () => setMounted(true),
    onUpdate: ({ editor: e }) => setJson(JSON.stringify(e.getJSON())),
  });

  function insert(image: PickerImage) {
    editor?.chain().focus().insertContent({ type: "image", attrs: { publicId: image.publicId, alt: image.alt, width: image.width || null, height: image.height || null } }).run();
    setPicking(false);
  }

  function insertProduct(item: ProductPickerItem) {
    editor?.chain().focus().insertContent({ type: "productEmbed", attrs: { productId: item.id, label: item.name } }).run();
    setPickingProduct(false);
  }

  return (
    <div className={`rounded-xl border ${invalid ? "border-coral-600" : "border-cream-200"}`} aria-describedby={describedBy}>
      <input type="hidden" name={name} value={json} />
      <div className="rounded-t-xl border-b border-cream-200 bg-cream-50 p-2">
        {editor ? <Toolbar editor={editor} onImage={() => setPicking(true)} canImage={!!cloudName} onProduct={searchProducts ? () => setPickingProduct(true) : undefined} /> : <p className="px-2 py-1.5 text-sm text-ink-600">Loading the editor…</p>}
        {!cloudName && <p className="mt-2 px-1 text-xs text-ink-600">Pictures are switched off because Cloudinary is not configured in this environment.</p>}
      </div>
      {picking && cloudName && (
        <div className="border-b border-cream-200 p-3">
          <ImagePicker cloudName={cloudName} uploadsEnabled={uploadsEnabled} search={search} sign={sign} record={record} onPick={insert} onClose={() => setPicking(false)} />
        </div>
      )}
      {pickingProduct && searchProducts && (
        <div className="border-b border-cream-200 p-3">
          <ProductPicker search={searchProducts} onPick={insertProduct} onClose={() => setPickingProduct(false)} />
        </div>
      )}
      <EditorContent editor={editor} />
      {!mounted && <noscript><p className="p-3 text-sm text-coral-600">The editor needs JavaScript.</p></noscript>}
    </div>
  );
}
