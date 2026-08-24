import { NextResponse } from "next/server";
import { requireSession, tenantBindStateCookieName, validateMicrosoftIdToken } from "../../../../../../lib/auth.js";
import { exchangeCode } from "../../../../../../lib/microsoft.js";
import { q } from "../../../../../../lib/db.js";

export async function GET(request) {
  try {
    const s = await requireSession(request);
    if (s.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = request.cookies.get(tenantBindStateCookieName())?.value;
    if (!code || !state || !storedState || state !== storedState) {
      return NextResponse.json({ error: "Estado OAuth inválido." }, { status: 400 });
    }

    const redirectUri = `${process.env.APP_URL}/api/integrations/microsoft/bind/callback`;
    const token = await exchangeCode(code, redirectUri);
    const claims = await validateMicrosoftIdToken(token.id_token);
    const tenantId = claims.tid;

    const conflict = await q(
      `SELECT id,name FROM organizations WHERE microsoft_tenant_id=$1 AND id<>$2 LIMIT 1`,
      [tenantId, s.orgId]
    );
    if (conflict.rowCount) {
      return NextResponse.json({ error: "TENANT_ALREADY_LINKED" }, { status: 409 });
    }

    await q(
      `UPDATE organizations SET microsoft_tenant_id=$1,updated_at=NOW() WHERE id=$2`,
      [tenantId, s.orgId]
    );

    const res = NextResponse.redirect(new URL("/pilot.html?tenantLinked=1", process.env.APP_URL));
    res.cookies.delete(tenantBindStateCookieName());
    return res;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
