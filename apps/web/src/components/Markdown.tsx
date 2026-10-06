import type { ReactNode } from "react";

/** Tiny safe markdown subset (headings, lists, bold, code, paragraphs). Output is React nodes, never raw HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? <code key={i} className="rounded bg-bg px-1 text-[0.9em]">{p.slice(1, -1)}</code>
      : p,
  );
}

export function Markdown({ source }: { source: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) out.push(<p key={out.length} className="my-3">{inline(para.join(" "))}</p>); para = []; };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={out.length} className={`my-3 space-y-1 pl-6 ${list.ordered ? "list-decimal" : "list-disc"}`}>{list.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</Tag>);
    list = null;
  };
  for (const line of source.split(/\r?\n/)) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = h[1]!.length;
      out.push(level <= 2 ? <h3 key={out.length} className="mt-5 mb-1 font-serif text-lg font-semibold">{inline(h[2]!)}</h3> : <h4 key={out.length} className="mt-4 font-semibold">{inline(h[2]!)}</h4>);
    } else if (li) {
      flushPara();
      const ordered = !!li[2];
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(li[3]!);
    } else if (line.trim() === "") { flushPara(); flushList(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return <div className="text-sm leading-relaxed">{out}</div>;
}
