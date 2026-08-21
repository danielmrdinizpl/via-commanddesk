import { NextResponse } from "next/server";
import { requireSession, demoModeEnabled } from "../../../lib/auth.js";
import { q } from "../../../lib/db.js";

export async function GET(request) {
  try {
    const s = await requireSession(request);
    const r = await q(
      `SELECT provider, scopes, connected_at, updated_at
       FROM integration_accounts
       WHERE organization_id=$1 AND user_id=$2
       ORDER BY provider`,
      [s.orgId, s.userId]
    );

    const microsoft = r.rows.find((row) => row.provider === "microsoft") || null;
    const configured = Boolean(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.APP_URL
    );

    return NextResponse.json({
      demo: demoModeEnabled(),
      microsoft: {
        configured,
        connected: !!microsoft,
        scopes: microsoft?.scopes || null,
        connectedAt: microsoft?.connected_at || null,
        updatedAt: microsoft?.updated_at || null,
        syncAvailable: demoModeEnabled() || !!microsoft
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
