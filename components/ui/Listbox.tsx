"use client";

import { useT } from "@/lib/i18n/client";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { Field, controlClass, describedBy } from "./Field";

export type ListboxOption = {
  value: string;
  label: string;
  /** Leading visual, for example a category badge. */
  icon?: ReactNode;
  /** Secondary text shown right-aligned, for example an account balance. */
  detail?: string;
  /** Shorter text for the closed trigger (the list still shows `label`). */
  shortLabel?: string;
  /** Options with the same group are listed together under a heading. */
  group?: string;
};

export type ListboxProps = {
  id: string;
  label: string;
  options: ListboxOption[];
  /** Controlled value. Use `defaultValue` for an uncontrolled field inside a plain form. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Form field name: a hidden input carries the value, so plain GET/POST forms keep working. */
  name?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Label for screen readers only. */
  hideLabel?: boolean;
  /** Replaces the default full-width bordered trigger style. */
  triggerClassName?: string;
  /** Extra classes for the open list, for example to align it or open it upwards. */
  menuClassName?: string;
};

/**
 * Custom select with icons (WAI-ARIA select-only combobox). Focus stays on the trigger and the
 * highlighted option is announced through aria-activedescendant.
 */
export function Listbox({
  id,
  label,
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  error,
  hint,
  disabled,
  placeholder,
  hideLabel,
  triggerClassName,
  menuClassName,
}: ListboxProps) {
  const t = useT();
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: 0 });
  const listId = useId();

  const selected = options.find((option) => option.value === current);
  const optionId = (index: number) => `${id}-option-${index}`;

  // Keep options of a group together while preserving their original order.
  const sections = useMemo(() => {
    const result: Array<{ group?: string; items: Array<{ option: ListboxOption; index: number }> }> = [];
    options.forEach((option, index) => {
      const last = result[result.length - 1];
      if (last && last.group === option.group) last.items.push({ option, index });
      else result.push({ group: option.group, items: [{ option, index }] });
    });
    return result;
  }, [options]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function openList() {
    if (disabled || options.length === 0) return;
    const index = options.findIndex((option) => option.value === current);
    setActive(index === -1 ? 0 : index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    typeahead.current.text = "";
    setInternal(option.value);
    onChange?.(option.value);
    setOpen(false);
  }

  function runTypeahead(character: string) {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.text += character.toLowerCase();
    state.timer = window.setTimeout(() => (state.text = ""), 700);
    const start = state.text.length === 1 ? active + 1 : active;
    for (let step = 0; step < options.length; step++) {
      const index = (start + step) % options.length;
      if (options[index].label.toLowerCase().startsWith(state.text)) {
        setActive(index);
        return;
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        openList();
        runTypeahead(event.key);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        // Closing the list must not also close a surrounding dialog.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          runTypeahead(event.key);
        }
    }
  }

  return (
    <Field id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <div ref={rootRef} className="relative">
        {name ? <input type="hidden" name={name} value={current} /> : null}
        <button
          type="button"
          id={id}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
          className={cn(triggerClassName ?? controlClass, "flex items-center gap-2 text-left")}
        >
          {selected?.icon}
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted")}>
            {selected?.shortLabel ?? selected?.label ?? placeholder ?? t("Select…")}
          </span>
          {selected?.detail ? <span className="shrink-0 text-xs text-muted tabular-nums">{selected.detail}</span> : null}
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            // Keeps focus on the trigger while the pointer interacts with the list.
            onMouseDown={(event) => event.preventDefault()}
            className={cn("absolute z-30 mt-1 max-h-64 w-full min-w-48 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg", menuClassName)}
          >
            {sections.map((section, sectionIndex) => {
              const items = section.items.map(({ option, index }) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === current}
                  onClick={() => choose(index)}
                  onMouseMove={() => active !== index && setActive(index)}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2 px-3 text-sm",
                    index === active && "bg-background",
                  )}
                >
                  {option.icon}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.detail ? <span className="shrink-0 text-xs text-muted tabular-nums">{option.detail}</span> : null}
                  {option.value === current ? <Check className="size-4 shrink-0 text-primary-strong" aria-hidden="true" /> : null}
                </li>
              ));
              if (!section.group) return items;
              const headingId = `${id}-group-${sectionIndex}`;
              return (
                <li key={`group-${sectionIndex}`} role="presentation">
                  <ul role="group" aria-labelledby={headingId}>
                    <li id={headingId} role="presentation" className="px-3 pb-1 pt-2 text-xs font-bold uppercase text-muted">
                      {section.group}
                    </li>
                    {items}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
