"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "@/lib/types";

const CITE = /\[(\d{1,2})\]/g;

function decorate(
  node: React.ReactNode,
  cites: Map<number, Citation>,
  onCite?: (c: Citation) => void,
  keyPrefix = "c"
): React.ReactNode {
  if (typeof node === "string") {
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    CITE.lastIndex = 0;
    while ((m = CITE.exec(node)) !== null) {
      const n = Number(m[1]);
      const c = cites.get(n);
      if (!c) continue;
      if (m.index > last) parts.push(node.slice(last, m.index));
      parts.push(
        <span
          key={`${keyPrefix}-${m.index}`}
          className="cite"
          title={`${c.sourceTitle} · part ${c.part}\n\n${c.snippet}…`}
          onClick={() => onCite?.(c)}
        >
          {n}
        </span>
      );
      last = m.index + m[0].length;
    }
    if (!parts.length) return node;
    if (last < node.length) parts.push(node.slice(last));
    return parts;
  }
  if (Array.isArray(node)) {
    return node.map((child, i) =>
      React.isValidElement(child) || typeof child === "string" ? (
        <React.Fragment key={i}>
          {decorate(child, cites, onCite, `${keyPrefix}-${i}`)}
        </React.Fragment>
      ) : (
        child
      )
    );
  }
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    if (el.props?.children) {
      return React.cloneElement(el, {
        children: decorate(el.props.children, cites, onCite, keyPrefix),
      });
    }
  }
  return node;
}

export default function Markdown({
  children,
  citations = [],
  onCite,
}: {
  children: string;
  citations?: Citation[];
  onCite?: (c: Citation) => void;
}) {
  const map = new Map(citations.map((c) => [c.n, c]));
  const wrap = (Tag: keyof React.JSX.IntrinsicElements) => {
    const Wrapped = ({ children: kids }: { children?: React.ReactNode }) =>
      React.createElement(Tag, null, decorate(kids, map, onCite));
    Wrapped.displayName = `Cited(${String(Tag)})`;
    return Wrapped;
  };

  return (
    <div className="prose-nb">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: wrap("p"),
          li: wrap("li"),
          td: wrap("td"),
          h1: wrap("h1"),
          h2: wrap("h2"),
          h3: wrap("h3"),
          h4: wrap("h4"),
          a: ({ href, children: kids }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {kids}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Plain-text variant for short strings (quiz explanations, bullets, etc). */
export function InlineCited({
  text,
  citations = [],
  onCite,
}: {
  text: string;
  citations?: Citation[];
  onCite?: (c: Citation) => void;
}) {
  const map = new Map(citations.map((c) => [c.n, c]));
  return <>{decorate(text, map, onCite)}</>;
}
