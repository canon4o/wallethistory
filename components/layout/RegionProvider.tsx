"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currencies";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

export type Region = { currency: CurrencyCode; timezone: string };

const DEFAULT_REGION: Region = { currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE };

const RegionContext = createContext<Region>(DEFAULT_REGION);

/** Gives client components the signed-in user's currency and timezone (server components get them as props). */
export function RegionProvider({ region, children }: { region: Region; children: ReactNode }) {
  return <RegionContext.Provider value={region}>{children}</RegionContext.Provider>;
}

export function useRegion(): Region {
  return useContext(RegionContext);
}
