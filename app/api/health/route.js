import { NextResponse } from "next/server";
import { q } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelUrl: process.env.VERCEL_URL || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null
  };

  try {
    await q("SELECT 1");
    return NextResponse.json({ ok: true, version: "4.1.0", db: "ok", diagnostics });
  } catch (error) {
    return NextResponse.json(
      { ok: false, version: "4.1.0", db: "error", error: error.message, diagnostics },
      { status: 500 }
    );
  }
}
