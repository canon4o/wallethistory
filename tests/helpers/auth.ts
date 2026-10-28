import { createSession } from "@/lib/auth/session";
import { cookieJar } from "./cookie-jar";

/** Makes the next calls behave as if this user were signed in (fresh session cookie). */
export async function signInAs(userId: string) {
  cookieJar.reset();
  await createSession(userId);
}

export function signOut() {
  cookieJar.reset();
}
