import { NextResponse } from "next/server";
import { sessionCookieName } from "../../../../lib/auth.js";

export async function GET() {
  const res = NextResponse.redirect(new URL("/pilot.html", process.env.APP_URL));
  res.cookies.delete(sessionCookieName());
  return res;
}
