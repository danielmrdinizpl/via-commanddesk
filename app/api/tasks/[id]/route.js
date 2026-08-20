import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth.js";
import { q } from "../../../../lib/db.js";

const allowed = new Set(["status","priority","title","description","due_date","department","monitor_outlook"]);

export async function PATCH(request, { params }) {
  try {
    const s = await requireSession(request);
    const body = await request.json();
    const fields = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(body)) {
      if (!allowed.has(key)) continue;
      fields.push(`${key}=$${i++}`);
      values.push(value);
    }
    if (!fields.length) return NextResponse.json({ error: "Nenhum campo atualizável." }, { status: 400 });

    const { id } = await params;
    values.push(s.orgId, id);
    const r = await q(
      `UPDATE tasks SET ${fields.join(",")}, updated_at=NOW()
       WHERE organization_id=$${i++} AND id=$${i}
       RETURNING *`,
      values
    );
    if (!r.rowCount) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    return NextResponse.json(r.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
