import { isDatabaseHealthy } from "@/db/health";

// Public, unauthenticated by design: it reports only up/down and reads no user data.
export const dynamic = "force-dynamic";

export async function GET() {
  const healthy = await isDatabaseHealthy();
  return Response.json(
    { status: healthy ? "ok" : "error" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
