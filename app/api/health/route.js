import { NextResponse } from "next/server";
import { q } from "../../../lib/db.js";

export async function GET() {
  try {
    await q("SELECT 1");
    return NextResponse.json({ ok: true, version: "4.1.0", db: "ok" });
  } catch (error) {
    return NextResponse.json({ ok: false, version: "4.1.0", db: "error", error: error.message }, { status: 500 });
  }
}
