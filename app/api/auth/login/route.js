import { NextResponse } from "next/server";
import { authorizeUrl } from "../../../../lib/microsoft.js";
import { demoModeEnabled, stateCookieName } from "../../../../lib/auth.js";
import crypto from "crypto";

export async function GET() {
  if (demoModeEnabled()) {
    return NextResponse.redirect(new URL("/pilot.html", process.env.APP_URL));
  }
  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(stateCookieName(), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  return res;
}
