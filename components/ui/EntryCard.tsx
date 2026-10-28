import type { ReactNode } from "react";
import { RowTapTarget } from "./RowTapTarget";

/**
 * The mobile card for one transaction or recurring rule, so both lists look the same:
 * icon, title and amount on top, then the small details with the actions on the same line, then note and tags.
 * The whole card opens the entry when tapped; `actions` are for extras that stay clickable on their own.
 */
export function EntryCard({
  leading,
  title,
  amount,
  meta,
  note,
  tags,
  actions,
  onSelect,
  selectLabel,
}: {
  leading: ReactNode;
  title: ReactNode;
  amount: ReactNode;
  /** Small details, one per line. */
  meta: ReactNode[];
  note?: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
  onSelect?: () => void;
  /** Accessible name of the tap target, e.g. "Edit rent". */
  selectLabel?: string;
}) {
  return (
    <li className="relative flex flex-col rounded-lg border border-border bg-surface pb-1 pl-3 pr-1 pt-3">
      <div className="flex items-center gap-2 pr-2">
        <span className="shrink-0">{leading}</span>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
        <span className="shrink-0 text-sm">{amount}</span>
      </div>
      <div className="flex items-center justify-between gap-2 pl-10">
        <div className="min-w-0 flex-1 py-1 text-xs text-muted">
          {meta.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
        <div className="relative z-10 flex shrink-0">{actions}</div>
      </div>
      {note ? <p className="pb-2 pl-10 pr-2 text-sm">{note}</p> : null}
      {tags ? <div className="pb-2 pl-10 pr-2">{tags}</div> : null}
      {onSelect && selectLabel ? <RowTapTarget label={selectLabel} onClick={onSelect} /> : null}
    </li>
  );
}
