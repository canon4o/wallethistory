/**
 * Makes a whole list row tappable on phones and tablets (below `lg`): put it inside a `relative` row. On wide screens
 * the row keeps its own edit and delete icon buttons instead.
 */
export function RowTapTarget({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute inset-0 rounded-lg hover:bg-text/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-strong lg:hidden"
    />
  );
}
