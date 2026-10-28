"use client";

import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { CURRENCIES, currencyLabel, type CurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/format";
import { timezoneOffsetLabel } from "@/lib/timezones";
import { useT } from "@/lib/i18n/client";

type Props = {
  /** Prefix for the element ids, so two forms on one page do not clash. */
  idPrefix: string;
  currency: CurrencyCode;
  timezone: string;
  /** Timezone names to offer, from the server (`listTimezones()`), so server and browser agree. */
  timezones: string[];
  onCurrencyChange: (currency: CurrencyCode) => void;
  onTimezoneChange: (timezone: string) => void;
  errors?: { currency?: string; timezone?: string };
  disabled?: boolean;
};

/** The two display settings, shared by registration, Profile -> Settings and the admin user page. */
export function RegionalFields({
  idPrefix,
  currency,
  timezone,
  timezones,
  onCurrencyChange,
  onTimezoneChange,
  errors,
  disabled,
}: Props) {
  const t = useT();
  // A stored timezone that the runtime lists under another name must still show as selected.
  const names = timezones.includes(timezone) ? timezones : [timezone, ...timezones];
  const options = names.map((name) => ({ value: name, label: name }));
  return (
    <>
      <Select
        id={`${idPrefix}-currency`}
        label={t("Currency")}
        value={currency}
        onChange={(event) => onCurrencyChange(event.target.value as CurrencyCode)}
        error={errors?.currency}
        hint={t("Only changes how amounts are shown, nothing is converted. Example: {example}", { example: formatMoney(1234.5, currency) })}
        disabled={disabled}
      >
        {CURRENCIES.map((item) => (
          <option key={item.code} value={item.code}>
            {currencyLabel(item.code)}
          </option>
        ))}
      </Select>
      <SearchableSelect
        id={`${idPrefix}-timezone`}
        label={t("Timezone")}
        options={options}
        value={timezone}
        onChange={onTimezoneChange}
        error={errors?.timezone}
        hint={t("Type to search. Decides which day \"today\" is for budgets, reports and recurring entries. Now {offset}.", { offset: timezoneOffsetLabel(timezone) })}
        disabled={disabled}
      />
    </>
  );
}
