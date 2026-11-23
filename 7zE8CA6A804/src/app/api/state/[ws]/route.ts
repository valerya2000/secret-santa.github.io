import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const WS_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_BODY = 4_000_000; // ~4 МБ на рабочее пространство прототипа

type Ctx = { params: Promise<{ ws: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { ws } = await ctx.params;
  if (!WS_RE.test(ws)) {
    return Response.json({ error: "bad workspace id" }, { status: 400 });
  }
  try {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, ws))
      .limit(1);
    const row = rows[0];
    if (!row) return Response.json({ data: null, updatedAt: 0 });
    return Response.json({
      data: row.data,
      updatedAt: row.updatedAt.getTime(),
    });
  } catch {
    return Response.json({ error: "db unavailable" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const { ws } = await ctx.params;
  if (!WS_RE.test(ws)) {
    return Response.json({ error: "bad workspace id" }, { status: 400 });
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const { data, updatedAt } = (body ?? {}) as {
    data?: unknown;
    updatedAt?: unknown;
  };
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as { games?: unknown }).games)
  ) {
    return Response.json({ error: "bad state shape" }, { status: 400 });
  }
  const ts =
    typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt > 0
      ? new Date(updatedAt)
      : new Date();
  try {
    await db
      .insert(workspaces)
      .values({ id: ws, data, updatedAt: ts })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: { data, updatedAt: ts },
      });
    return Response.json({ ok: true, updatedAt: ts.getTime() });
  } catch {
    return Response.json({ error: "db unavailable" }, { status: 500 });
  }
}
