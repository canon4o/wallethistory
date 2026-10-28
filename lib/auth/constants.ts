// Plain constants shared by proxy.ts (no server-only imports allowed there) and the session code.

export const SESSION_COOKIE = "wh_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const HOUSEHOLD_INVITE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
export const MAX_PENDING_HOUSEHOLD_INVITES = 20;
