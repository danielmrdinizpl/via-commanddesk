import { NextResponse } from "next/server";
import {
  stateCookieName, sessionCookieName, signSession,
  validateMicrosoftIdToken, upsertMicrosoftIdentity
} from "../../../../lib/auth.js";
import { exchangeCode, storeMicrosoftTokens } from "../../../../lib/microsoft.js";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = request.cookies.get(stateCookieName())?.value;

    if (!code || !state || !storedState || state !== storedState) {
      return NextResponse.json({ error: "Estado OAuth inválido." }, { status: 400 });
    }

    const token = await exchangeCode(code);
    const claims = await validateMicrosoftIdToken(token.id_token);
    const identity = await upsertMicrosoftIdentity(claims);

    await storeMicrosoftTokens(identity.org.id, identity.user.id, token);

    const session = await signSession({
      orgId: identity.org.id,
      userId: identity.user.id,
      role: identity.user.role,
      name: identity.user.name,
      email: identity.user.email,
      demo: false
    });

    const res = NextResponse.redirect(new URL("/pilot.html", process.env.APP_URL));
    res.cookies.set(sessionCookieName(), session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/"
    });
    res.cookies.delete(stateCookieName());
    return res;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
