import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireSession, tenantBindStateCookieName } from "../../../../../lib/auth.js";
import { authorizeUrl } from "../../../../../lib/microsoft.js";

export async function GET(request) {
  try {
    const s = await requireSession(request);
    if (s.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET || !process.env.APP_URL) {
      return NextResponse.json({ error: "MICROSOFT_NOT_CONFIGURED" }, { status: 409 });
    }

    const state = crypto.randomBytes(24).toString("base64url");
    const redirectUri = `${process.env.APP_URL}/api/integrations/microsoft/bind/callback`;
    const res = NextResponse.redirect(authorizeUrl(state, redirectUri));
    res.cookies.set(tenantBindStateCookieName(), state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/"
    });
    return res;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
