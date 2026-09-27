import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { formatSummary, runNotifier } from "@/lib/notify";

// Déclencheur HTTP du notifier, pour un scheduler externe (cron-job.org,
// Vercel Cron, crontab + curl…). Protégé par CRON_SECRET, passé en
// `?token=` ou en header `Authorization: Bearer <secret>`.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function isAuthorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return (!!bearer && safeEqual(bearer, secret)) || (!!token && safeEqual(token, secret));
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré" },
      { status: 500, headers: NO_STORE }
    );
  }
  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401, headers: NO_STORE });
  }

  try {
    const summary = await runNotifier();
    console.log("[notify]\n" + formatSummary(summary));
    return NextResponse.json(summary, { headers: NO_STORE });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notify]", message);
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
