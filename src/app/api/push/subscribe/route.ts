import { NextRequest, NextResponse } from "next/server";
import {
  addOrUpdate,
  parseSubscription,
  remove,
  sanitizeCriteria,
  updateCriteria,
} from "@/lib/push-store";

// Gestion des abonnements Web Push du navigateur courant.
// POST   { subscription, criteria }  → enregistre / met à jour (201)
// PATCH  { endpoint, criteria }      → resynchronise les critères (200)
// DELETE { endpoint }                → désabonne (200)
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readEndpoint(body: Record<string, unknown>): string | null {
  const e = body.endpoint;
  return typeof e === "string" && e.startsWith("https://") && e.length <= 2048 ? e : null;
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const subscription = body && parseSubscription(body.subscription);
  if (!body || !subscription) return json({ error: "Souscription invalide" }, 400);

  try {
    await addOrUpdate(subscription, sanitizeCriteria(body.criteria));
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur" }, 409);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await readBody(req);
  const endpoint = body && readEndpoint(body);
  if (!body || !endpoint) return json({ error: "Endpoint invalide" }, 400);

  const found = await updateCriteria(endpoint, sanitizeCriteria(body.criteria));
  return found ? json({ ok: true }) : json({ error: "Abonnement inconnu" }, 404);
}

export async function DELETE(req: NextRequest) {
  const body = await readBody(req);
  const endpoint = body && readEndpoint(body);
  if (!body || !endpoint) return json({ error: "Endpoint invalide" }, 400);

  await remove(endpoint);
  return json({ ok: true });
}
