"use server";

import { requireUser } from "@/lib/auth/session";
import { getQuickAddOptions, type QuickAddOptions } from "@/lib/data/quick-add";
import { guarded, type ActionResult } from "./result";

/** Reads the quick-add form data on demand, the first time the user opens the floating button. */
export async function loadQuickAddOptions(): Promise<ActionResult<{ options: QuickAddOptions }>> {
  await requireUser();
  return guarded(async () => ({ ok: true as const, options: await getQuickAddOptions() }));
}
