/** Pages that show the floating quick-add button (reports, profile and admin pages do not). */
const QUICK_ADD_PATHS = ["/dashboard", "/transactions", "/budgets", "/goals"];

export function showsQuickAdd(pathname: string): boolean {
  return QUICK_ADD_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
