import { NextResponse } from "next/server";
import { readSession, demoModeEnabled } from "../../../lib/auth.js";
import { permissionsForRole } from "../../../lib/permissions.js";
import { q } from "../../../lib/db.js";

export async function GET(request) {
  const session = await readSession(request);
  if (!session) return NextResponse.json({ authenticated: false, demo: false }, { status: 401 });

  const [userR, orgR, integrationR] = await Promise.all([
    q(`SELECT id,name,email,role,department,job_title FROM users WHERE id=$1 AND organization_id=$2`, [session.userId, session.orgId]),
    q(`SELECT id,name,microsoft_tenant_id FROM organizations WHERE id=$1`, [session.orgId]),
    q(`SELECT 1 FROM integration_accounts WHERE organization_id=$1 AND user_id=$2 AND provider='microsoft'`, [session.orgId, session.userId])
  ]);

  const user = userR.rows[0] || {
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    department: null,
    job_title: null
  };

  return NextResponse.json({
    authenticated: true,
    demo: demoModeEnabled(),
    organization: orgR.rows[0] || null,
    user,
    permissions: permissionsForRole(user.role),
    outlookConnected: integrationR.rowCount > 0
  });
}
