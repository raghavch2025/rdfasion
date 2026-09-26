import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { advanceJobs, falConfigured, retryColour, startGeneration } from "@/lib/generation";

export const maxDuration = 60;

// POST /api/generate (admin): {product_id, color_ids?} starts generation,
// {product_id, retry_color_id} retries one colour, {product_id, poll: true}
// advances running jobs.
export async function POST(req: Request) {
  if (!(await getAdmin())) return new NextResponse(null, { status: 401 });
  if (!falConfigured()) return NextResponse.json({ error: "fal_not_configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { product_id?: string; color_ids?: string[]; retry_color_id?: string; poll?: boolean };
  if (!b.product_id) return NextResponse.json({ error: "product_id" }, { status: 400 });
  try {
    if (b.poll) await advanceJobs(b.product_id);
    else if (b.retry_color_id) await retryColour(b.product_id, b.retry_color_id);
    else await startGeneration(b.product_id, b.color_ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
