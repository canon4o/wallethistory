import { NextResponse } from "next/server";
import { isDatabaseHealthy } from "@/lib/data/health";

// Used by the Docker healthcheck and uptime monitors. Public on purpose and returns no details.
export const dynamic = "force-dynamic";

export async function GET() {
  const healthy = await isDatabaseHealthy();
  return NextResponse.json(
    { status: healthy ? "ok" : "error" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
