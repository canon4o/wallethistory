"use client";

import { useT } from "@/lib/i18n/client";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { Field, controlClass, describedBy } from "./Field";

export type SearchableOption = { value: string; label: string };

export type SearchableSelectProps = {
  id: string;
  label: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  /** Shown when nothing matches what was typed. */
  emptyText?: string;
};

/** Lowercase, with separators turned into spaces, so "new york" finds "America/New_York". */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[_/\-]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Select with a search box (WAI-ARIA editable combobox with a list popup). Typing filters the
 * options; arrow keys move, Enter picks, Escape closes. Focus always stays in the input.
 */
export function SearchableSelect({
  id,
  label,
  options,
  value,
  onChange,
  error,
  hint,
  disabled,
  emptyText,
}: SearchableSelectProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${id}-option-${index}`;

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    const words = needle.split(" ");
    return options.filter((option) => {
      const text = normalize(option.label);
      return words.every((word) => text.includes(word));
    });
  }, [options, query]);

  function openList() {
    if (disabled || open) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(index: number) {
    const option = filtered[index];
    if (!option) return;
    onChange(option.value);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case "Enter":
        // Never submit the surrounding form while the list is open.
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && filtered[active] ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          disabled={disabled}
          value={open ? query : (selected?.label ?? value)}
          placeholder={open ? (selected?.label ?? "") : undefined}
          onFocus={openList}
          onClick={openList}
          onBlur={close}
          onChange={(event) => {
            if (!open) setOpen(true);
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={cn(controlClass, "pr-9")}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            // Keeps focus in the input while the pointer interacts with the list.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute z-30 mt-1 max-h-64 w-full min-w-48 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li role="presentation" className="px-3 py-2 text-sm text-muted">
                {emptyText ?? t("No matches")}
              </li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => choose(index)}
                  onMouseMove={() => active !== index && setActive(index)}
                  ref={(node) => {
                    if (node && index === active) node.scrollIntoView?.({ block: "nearest" });
                  }}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2 px-3 text-sm",
                    index === active && "bg-background",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.value === value ? <Check className="size-4 shrink-0 text-primary-strong" aria-hidden="true" /> : null}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
