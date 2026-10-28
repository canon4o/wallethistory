/** Runs something that calls Next's redirect() and returns the target URL. */
export async function redirectTarget(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw error;
  }
  throw new Error("expected a redirect, but the call returned normally");
}
