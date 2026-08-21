import { NextResponse } from "next/server";
import { requireSession, demoModeEnabled } from "../../../lib/auth.js";
import { q, tx } from "../../../lib/db.js";

async function readSettings(session) {
  const [orgR, userR, integrationR] = await Promise.all([
    q(`SELECT id,name,microsoft_tenant_id,updated_at FROM organizations WHERE id=$1`, [session.orgId]),
    q(`SELECT id,name,email,role,department,job_title,updated_at FROM users WHERE id=$1 AND organization_id=$2`, [session.userId, session.orgId]),
    q(`SELECT connected_at,updated_at FROM integration_accounts WHERE organization_id=$1 AND user_id=$2 AND provider='microsoft'`, [session.orgId, session.userId])
  ]);

  return {
    organization: orgR.rows[0] || null,
    user: userR.rows[0] || null,
    environment: {
      demo: demoModeEnabled(),
      outlookConnected: integrationR.rowCount > 0
    }
  };
}

export async function GET(request) {
  try {
    const s = await requireSession(request);
    return NextResponse.json(await readSettings(s));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function PATCH(request) {
  try {
    const s = await requireSession(request);
    const body = await request.json();
    const organizationName = body.organizationName !== undefined ? String(body.organizationName || "").trim() : undefined;
    const name = body.name !== undefined ? String(body.name || "").trim() : undefined;
    const department = body.department !== undefined ? String(body.department || "").trim() : undefined;
    const jobTitle = body.jobTitle !== undefined ? String(body.jobTitle || "").trim() : undefined;

    if (organizationName !== undefined && !organizationName) {
      return NextResponse.json({ error: "Nome da organização obrigatório." }, { status: 400 });
    }
    if (organizationName !== undefined && s.role !== "admin") {
      return NextResponse.json({ error: "Somente administradores podem alterar a organização." }, { status: 403 });
    }
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Nome do usuário obrigatório." }, { status: 400 });
    }

    await tx(async (client) => {
      if (organizationName !== undefined) {
        await client.query(
          `UPDATE organizations SET name=$1,updated_at=NOW() WHERE id=$2`,
          [organizationName, s.orgId]
        );
      }

      const fields = [];
      const values = [];
      let i = 1;
      if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
      if (department !== undefined) { fields.push(`department=$${i++}`); values.push(department || "Geral"); }
      if (jobTitle !== undefined) { fields.push(`job_title=$${i++}`); values.push(jobTitle || null); }
      if (fields.length) {
        values.push(s.userId, s.orgId);
        await client.query(
          `UPDATE users SET ${fields.join(",")},updated_at=NOW() WHERE id=$${i++} AND organization_id=$${i}`,
          values
        );
      }
    });

    return NextResponse.json(await readSettings(s));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
