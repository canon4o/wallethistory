"use client";

import { DateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { RecurringFrequency } from "@/lib/recurring/dates";
import { FREQUENCY_OPTIONS } from "@/lib/recurring/labels";
import type { ActionFailure } from "@/lib/actions/result";
import { useT } from "@/lib/i18n/client";

export type RepeatValue = {
  enabled: boolean;
  frequency: RecurringFrequency;
  intervalCount: string;
  endDate: string;
};

export type RepeatErrors = Partial<Record<"frequency" | "intervalCount" | "endDate", string>>;

export const DEFAULT_REPEAT: RepeatValue = { enabled: false, frequency: "monthly", intervalCount: "1", endDate: "" };

const REPEAT_FIELDS = ["frequency", "intervalCount", "endDate"] as const;

/**
 * Splits a failed `createRecurringRule` into the errors that belong to the repeat fields and a
 * failure for the form itself (the rule's `startDate` is the form's Date field).
 */
export function splitRepeatErrors(failure: ActionFailure): { form: ActionFailure; repeat: RepeatErrors } {
  const repeat: RepeatErrors = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
    if ((REPEAT_FIELDS as readonly string[]).includes(field)) {
      repeat[field as keyof RepeatErrors] = messages[0];
    } else {
      fieldErrors[field === "startDate" ? "date" : field] = messages;
    }
  }
  return { form: { ...failure, fieldErrors }, repeat };
}

type RepeatFieldsProps = {
  /** Prefix for element ids, so two forms on a page never clash. */
  idPrefix: string;
  value: RepeatValue;
  onChange: (value: RepeatValue) => void;
  errors?: RepeatErrors;
};

/** "Repeat" section of the add forms: a checkbox that reveals the schedule. */
export function RepeatFields({ idPrefix, value, onChange, errors = {} }: RepeatFieldsProps) {
  const t = useT();
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{t("Repeat")}</legend>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        {t("Repeat this automatically")}
      </label>
      {value.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id={`${idPrefix}-interval`}
              label={t("Every")}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={value.intervalCount}
              onChange={(event) => onChange({ ...value, intervalCount: event.target.value })}
              error={errors.intervalCount}
            />
            <Select
              id={`${idPrefix}-frequency`}
              label={t("Frequency")}
              value={value.frequency}
              onChange={(event) => onChange({ ...value, frequency: event.target.value as RecurringFrequency })}
              error={errors.frequency}
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </Select>
          </div>
          <DateInput
            id={`${idPrefix}-end`}
            label={t("Ends on (optional)")}
            clearable
            value={value.endDate}
            onChange={(endDate) => onChange({ ...value, endDate })}
            error={errors.endDate}
            hint={t("The date above is the first entry. Leave this empty to repeat until you stop it under Profile → Recurring.")}
          />
        </>
      ) : null}
    </fieldset>
  );
}
