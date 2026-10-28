"use client";

import { useState, type InputHTMLAttributes, type Ref } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import type { Placement } from "@floating-ui/react";
import { bg } from "date-fns/locale/bg";
import { es } from "date-fns/locale/es";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "./cn";
import { Field, controlClass, describedBy } from "./Field";

registerLocale("bg", bg);
registerLocale("es", es);

/** 0 = Sunday, 1 = Monday. */
type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type DateInputProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Form field name, for plain GET/POST forms (the value is submitted as `YYYY-MM-DD`). */
  name?: string;
  /** Controlled value (`YYYY-MM-DD` or empty). Leave out and use `defaultValue` for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Shows a clear button and allows an empty date. */
  clearable?: boolean;
  /** Where the calendar opens relative to the field; it flips on its own when there is no room. */
  placement?: Placement;
  weekStart?: WeekStart;
  disabled?: boolean;
  required?: boolean;
};

/**
 * Dates are picked from the calendar, never typed (this also keeps the phone keyboard closed).
 * react-datepicker's own `readOnly` prop would also stop the popup from opening, so the input
 * itself is made read-only instead.
 */
export function ReadOnlyInput({ ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} readOnly />;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseISO(value: string): Date | null {
  if (!ISO.test(value)) return null;
  const date = new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISO(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date field with a themed calendar popup. Reads and writes `YYYY-MM-DD` strings, like the native date input did. */
export function DateInput({
  id,
  label,
  error,
  hint,
  name,
  value,
  defaultValue = "",
  onChange,
  clearable = false,
  placement = "bottom-start",
  weekStart = 1,
  disabled,
  required,
}: DateInputProps) {
  const locale = useLocale();
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <DatePicker
        id={id}
        name={name}
        selected={parseISO(current)}
        onChange={(date: Date | null) => {
          const next = date ? toISO(date) : "";
          setInternal(next);
          onChange?.(next);
        }}
        dateFormat="yyyy-MM-dd"
        placeholderText="YYYY-MM-DD"
        customInput={<ReadOnlyInput />}
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        showPopperArrow={false}
        locale={locale}
        calendarStartDay={weekStart}
        popperPlacement={placement}
        popperProps={{ strategy: "fixed" }}
        isClearable={clearable}
        autoComplete="off"
        disabled={disabled}
        required={required}
        ariaInvalid={error ? "true" : undefined}
        ariaDescribedBy={describedBy(id, error, hint)}
        wrapperClassName="w-full"
        className={cn(controlClass)}
      />
    </Field>
  );
}
