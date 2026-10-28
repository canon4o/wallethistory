import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Landing point for a cookie that no longer maps to a valid session. Cookies cannot be
// cleared while rendering a page, so requireUser() sends the browser here to drop it.
export async function GET() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
