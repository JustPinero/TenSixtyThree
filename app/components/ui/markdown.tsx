/**
 * Renders the markdown subset produced by lib/briefing (Phase 63.3).
 *
 * AST -> React elements. No dangerouslySetInnerHTML anywhere on the path,
 * so briefing text (project names, paths, log excerpts) can never inject
 * markup.
 */
import { Fragment } from "react";
import { type Block, type Inline, parseMarkdownLite } from "@/lib/markdown-lite";

function renderInline(children: Inline[]) {
  return children.map((node, i) => {
    if (node.type === "strong") {
      return (
        <strong key={i} className="font-bold text-text-bright">
          {node.value}
        </strong>
      );
    }
    if (node.type === "code") {
      return (
        <code key={i} className="px-1 py-0.5 bg-space-900 border border-space-600 text-cyan">
          {node.value}
        </code>
      );
    }
    return <Fragment key={i}>{node.value}</Fragment>;
  });
}

function renderBlock(block: Block, key: number) {
  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h2" : "h3";
    return (
      <Tag
        key={key}
        className={
          block.level === 2
            ? "text-sm font-mono font-bold text-cyan uppercase tracking-wider"
            : "text-xs font-mono font-bold text-text-bright uppercase tracking-wider"
        }
      >
        {renderInline(block.children)}
      </Tag>
    );
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag
        key={key}
        className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
      >
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>
    );
  }
  return <p key={key}>{renderInline(block.children)}</p>;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdownLite(source);
  return (
    <div className={`space-y-3 ${className ?? ""}`.trim()}>
      {blocks.map(renderBlock)}
    </div>
  );
}
