import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

// A valid cost-12 hash of a random string nobody knows. Used so a login for an unknown
// email costs the same as one for a known email (no timing leak of which emails exist).
const DUMMY_HASH = "$2b$12$Y.js4Oo5cBNJoyadROro/.M8/Iw1uEImO3pMRlmv.I3PLF2NPVkVm";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Compares against the real hash, or against a dummy one when the user does not exist. */
export async function verifyPasswordOrDummy(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash ? matches : false;
}
