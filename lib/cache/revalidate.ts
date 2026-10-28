import { cache } from "react";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { bumpUsers } from "./index";

/** Once per request: an action that revalidates several paths bumps the cache version once. */
const bumpedThisRequest = cache(() => ({ done: false }));

/**
 * Drop-in for `revalidatePath` in Server Actions. A write changes what the cache holds, so it also
 * moves the signed-in user's cache version on (which refreshes their household's views too).
 * Actions that change another user's data call `bumpUsers` for that user as well.
 */
export async function revalidatePath(path: string, type?: "page" | "layout"): Promise<void> {
  const flag = bumpedThisRequest();
  if (!flag.done) {
    flag.done = true;
    const user = await getCurrentUser();
    if (user) await bumpUsers([user.id]);
  }
  if (type) nextRevalidatePath(path, type);
  else nextRevalidatePath(path);
}
