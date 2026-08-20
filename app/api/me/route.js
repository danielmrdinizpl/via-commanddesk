import { NextResponse } from "next/server";
import { readSession, demoModeEnabled } from "../../../lib/auth.js";
import { q } from "../../../lib/db.js";

export async function GET(request) {
  const session = await readSession(request);
  if (!session) return NextResponse.json({ authenticated: false, demo: false }, { status: 401 });

  let connected = false;
  if (!demoModeEnabled()) {
    const r = await q(
      `SELECT 1 FROM integration_accounts
       WHERE organization_id=$1 AND user_id=$2 AND provider='microsoft'`,
      [session.orgId, session.userId]
    );
    connected = r.rowCount > 0;
  }

  return NextResponse.json({
    authenticated: true,
    demo: !!session.demo,
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role
    },
    outlookConnected: connected
  });
}
