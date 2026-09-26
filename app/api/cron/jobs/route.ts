import { NextResponse } from "next/server";
import { advanceJobs } from "@/lib/generation";

export const maxDuration = 60;

// Vercel cron: retries stuck and queued generation jobs.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  await advanceJobs();
  return NextResponse.json({ ok: true });
}
