"use client";
import { Fragment } from "react";
import { useNav } from "../context";
import { monthLabel } from "../lib/format";

/** "April 2026, June 2026", each a link to that month's page. */
export function MonthLinks({ months }: { months: string[] }) {
  const nav = useNav();
  const { Link } = nav;
  return (
    <>
      {months.map((m, i) => (
        <Fragment key={m}>
          {i > 0 && ", "}
          <Link href={nav.hrefs.month(m)} className="underline underline-offset-2 hover:text-fg">{monthLabel(m)}</Link>
        </Fragment>
      ))}
    </>
  );
}
