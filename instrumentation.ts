// Runs once when the server starts (not during `next build`). It validates the environment up
// front, so a missing or invalid variable stops the server with a clear message instead of
// failing on the first request. It also reads DEPLOYMENT_MODE once, at startup.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./lib/env");
    getEnv();
  }
}
