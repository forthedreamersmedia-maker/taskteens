import { Fragment } from "react";

/**
 * Renders a legal document written in a tiny markup:
 *   "## Heading", "### Subheading", "* bullet", "1) numbered item", blank line = paragraph break.
 * Email addresses become mailto links.
 */
function linkify(text: string) {
  const parts = text.split(/([\w.+-]+@[\w-]+\.[\w.]+)/g);
  return parts.map((p, i) =>
    /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(p) ? (
      <a key={i} href={`mailto:${p}`} className="link">
        {p}
      </a>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

export function LegalDoc({ source }: { source: string }) {
  const lines = source.trim().split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? "mt-3 list-decimal space-y-1.5 pl-5" : undefined}>
        {list.items.map((it, i) => (
          <li key={i}>{linkify(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^\*\s+(.*)$/);
    const numbered = line.match(/^\d+\)\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (line.startsWith("## ")) {
      const t = line.slice(3);
      const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      blocks.push(
        <h2 key={blocks.length} id={id} className="scroll-mt-24">
          {t}
        </h2>,
      );
    } else if (line.startsWith("### ")) blocks.push(<h3 key={blocks.length}>{line.slice(4)}</h3>);
    else blocks.push(<p key={blocks.length}>{linkify(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** Table of contents from "## " headings. */
export function LegalToc({ source }: { source: string }) {
  const heads = source.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
  return (
    <nav aria-label="Contents" className="mt-6 rounded-2xl border border-navy-100 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Contents</p>
      <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {heads.map((h) => (
          <li key={h}>
            <a className="text-navy-600 hover:text-bay-600 hover:underline" href={`#${h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}>
              {h}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
