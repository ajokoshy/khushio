import type { ReactNode } from "react";
import Link from "next/link";
import { ProductImage } from "@/shared/catalog/product-image";
import { sanitizeDocument, type BlockNode, type Doc, type InlineNode, type ListItemNode, type TextNode } from "@/modules/content/document";

/**
 * Draws an article document with React elements only. There is no dangerouslySetInnerHTML anywhere: text goes through
 * React's escaping, links and images are rebuilt from checked values, and the document is sanitised again here, so
 * even a row written outside the editor (a script, an import) can not put markup or script on the page.
 */

function renderText(node: TextNode, key: number): ReactNode {
  let out: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = <strong>{out}</strong>;
    else if (mark.type === "italic") out = <em>{out}</em>;
    else if (mark.type === "link") {
      const { href } = mark.attrs;
      out = href.startsWith("/")
        ? <Link href={href} className="text-coral-600 underline underline-offset-2">{out}</Link>
        : <a href={href} rel="noopener noreferrer" target={href.startsWith("mailto:") ? undefined : "_blank"} className="text-coral-600 underline underline-offset-2">{out}</a>;
    }
  }
  return <span key={key} className="contents">{out}</span>;
}

function renderInline(nodes: readonly InlineNode[]): ReactNode[] {
  return nodes.map((n, i) => (n.type === "text" ? renderText(n, i) : <br key={i} />));
}

function renderBlocks(blocks: readonly (BlockNode | ListItemNode)[]): ReactNode[] {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "paragraph":
        return <p key={i}>{renderInline(block.content)}</p>;
      case "heading":
        return block.attrs.level === 2 ? <h2 key={i}>{renderInline(block.content)}</h2> : block.attrs.level === 3 ? <h3 key={i}>{renderInline(block.content)}</h3> : <h4 key={i}>{renderInline(block.content)}</h4>;
      case "bulletList":
        return <ul key={i}>{renderBlocks(block.content)}</ul>;
      case "orderedList":
        return <ol key={i}>{renderBlocks(block.content)}</ol>;
      case "listItem":
        return <li key={i}>{renderBlocks(block.content)}</li>;
      case "blockquote":
        return <blockquote key={i}>{renderBlocks(block.content)}</blockquote>;
      case "image": {
        const { publicId, alt, width = 1200, height = 800 } = block.attrs;
        return (
          <figure key={i}>
            <ProductImage publicId={publicId} alt={alt} profiles={["card", "product", "editorial"]} fallback="product" sizes="(min-width: 768px) 720px, 100vw" width={width} height={height} className="h-auto w-full rounded-card" />
          </figure>
        );
      }
    }
  });
}

export function DocumentRenderer({ doc }: { doc: Doc }) {
  const clean = sanitizeDocument(doc);
  return <div className="article-body max-w-prose space-y-4 text-lg leading-relaxed [&_blockquote]:border-l-4 [&_blockquote]:border-coral-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-2xl [&_h3]:mt-6 [&_h3]:text-xl [&_h4]:mt-4 [&_h4]:text-lg [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">{renderBlocks(clean.content)}</div>;
}
