import { NextResponse } from "next/server";
import { requireSession, demoModeEnabled } from "../../../../lib/auth.js";
import { q } from "../../../../lib/db.js";

export async function DELETE(request) {
  try {
    const s = await requireSession(request);
    if (demoModeEnabled()) {
      return NextResponse.json({ error: "Integração real não está ativa no modo Demo." }, { status: 409 });
    }

    const r = await q(
      `DELETE FROM integration_accounts
       WHERE organization_id=$1 AND user_id=$2 AND provider='microsoft'
       RETURNING id`,
      [s.orgId, s.userId]
    );

    return NextResponse.json({ ok: true, disconnected: r.rowCount > 0 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
