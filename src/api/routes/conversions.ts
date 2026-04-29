import { requireAuth } from "../middleware/auth";
import { json } from "../respond";
import type { Handler } from "../router";

export const history: Handler = requireAuth(async (_req, ctx) => {
  const records = await ctx.services.conversions.history(ctx.currentUser!.id);
  return json({ records });
});

export const detail: Handler = requireAuth(async (req, ctx) => {
  const id = new URL(req.url).searchParams.get("id")?.trim() || "";
  if (!id) return json({ error: "bad_request", message: "missing id" }, { status: 400 });
  const record = await ctx.services.conversions.findById(ctx.currentUser!.id, id);
  if (!record) return json({ error: "not_found", message: "record not found" }, { status: 404 });
  return json({ record });
});

export const remove: Handler = requireAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null) as { id?: string } | null;
  const id = body?.id?.trim() || "";
  if (!id) return json({ error: "bad_request", message: "missing id" }, { status: 400 });
  const deleted = await ctx.services.conversions.deleteById(ctx.currentUser!.id, id);
  return json({ ok: true, deleted });
});
