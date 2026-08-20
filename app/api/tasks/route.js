import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth.js";
import { q } from "../../../lib/db.js";

export async function GET(request) {
  try {
    const s = await requireSession(request);
    const r = await q(
      `SELECT t.*, p.name project_name, u.name owner_name
       FROM tasks t
       LEFT JOIN projects p ON p.id=t.project_id
       LEFT JOIN users u ON u.id=t.owner_id
       WHERE t.organization_id=$1
       ORDER BY t.updated_at DESC`, [s.orgId]
    );
    return NextResponse.json(r.rows);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request);
    const body = await request.json();
    if (!body.title?.trim()) return NextResponse.json({ error: "Título obrigatório." }, { status: 400 });

    const r = await q(
      `INSERT INTO tasks
       (organization_id,title,description,status,priority,department,project_id,owner_id,due_date,
        monitor_outlook,mail_keywords,mail_domain,mail_contact,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        s.orgId, body.title.trim(), body.description || "", body.status || "A Fazer",
        body.priority || "Média", body.department || "Geral", body.projectId || null,
        body.ownerId || s.userId, body.dueDate || null, !!body.monitorOutlook,
        Array.isArray(body.mailKeywords) ? body.mailKeywords : [],
        body.mailDomain || null, body.mailContact || null, s.userId
      ]
    );

    await q(
      `INSERT INTO activity (organization_id,task_id,type,title,detail,actor_user_id)
       VALUES ($1,$2,'task_created','Tarefa criada',$3,$4)`,
      [s.orgId, r.rows[0].id, body.title.trim(), s.userId]
    );

    return NextResponse.json(r.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
