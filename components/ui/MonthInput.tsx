"use client";

import DatePicker from "react-datepicker";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "./cn";
import { ReadOnlyInput } from "./DateInput";
import { Field, controlClass } from "./Field";

type MonthInputProps = {
  id: string;
  label: string;
  /** Form field name; the value is submitted as `YYYY-MM`. */
  name?: string;
  /** `YYYY-MM`. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

const MONTH = /^(\d{4})-(\d{2})$/;

function parseMonth(value: string): Date | null {
  const match = MONTH.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : null;
}

/** Month field with the same themed calendar popup as DateInput, showing months instead of days. */
export function MonthInput({ id, label, name, value, onChange, required }: MonthInputProps) {
  const locale = useLocale();
  return (
    <Field id={id} label={label}>
      <DatePicker
        id={id}
        name={name}
        selected={parseMonth(value)}
        onChange={(date: Date | null) => {
          if (date) onChange(`${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}`);
        }}
        dateFormat="yyyy-MM"
        placeholderText="YYYY-MM"
        showMonthYearPicker
        customInput={<ReadOnlyInput />}
        showPopperArrow={false}
        locale={locale}
        popperPlacement="bottom-start"
        popperProps={{ strategy: "fixed" }}
        autoComplete="off"
        required={required}
        wrapperClassName="w-full"
        className={cn(controlClass)}
      />
    </Field>
  );
}
