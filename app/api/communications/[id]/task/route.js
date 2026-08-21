import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/auth.js";
import { q, tx } from "../../../../../lib/db.js";

export async function POST(request, { params }) {
  try {
    const s = await requireSession(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const emailR = await q(
      `SELECT * FROM emails WHERE id=$1 AND organization_id=$2`,
      [id, s.orgId]
    );
    if (!emailR.rowCount) return NextResponse.json({ error: "Comunicação não encontrada." }, { status: 404 });
    const email = emailR.rows[0];

    if (email.task_id) {
      const existing = await q(
        `SELECT * FROM tasks WHERE id=$1 AND organization_id=$2`,
        [email.task_id, s.orgId]
      );
      return NextResponse.json({ task: existing.rows[0] || null, alreadyLinked: true });
    }

    const userR = await q(
      `SELECT department FROM users WHERE id=$1 AND organization_id=$2`,
      [s.userId, s.orgId]
    );
    const department = body.department || userR.rows[0]?.department || "Geral";
    const title = String(body.title || email.subject || "Ação a partir de comunicação").trim();
    const priority = body.priority || (Number(email.score || 0) >= 65 ? "Alta" : "Média");
    const description = body.description || [
      `Origem: ${email.from_name || email.from_email || "Comunicação"}`,
      email.from_email ? `E-mail: ${email.from_email}` : null,
      email.preview || email.body_excerpt || null
    ].filter(Boolean).join("\n\n");

    const task = await tx(async (client) => {
      const taskR = await client.query(
        `INSERT INTO tasks
         (organization_id,title,description,status,priority,department,owner_id,due_date,
          monitor_outlook,mail_keywords,mail_domain,mail_contact,created_by)
         VALUES ($1,$2,$3,'A Fazer',$4,$5,$6,$7,true,$8,$9,$10,$6)
         RETURNING *`,
        [
          s.orgId,
          title,
          description,
          priority,
          department,
          s.userId,
          body.dueDate || null,
          [email.subject || ""].filter(Boolean),
          email.from_email?.includes("@") ? `@${email.from_email.split("@")[1]}` : null,
          email.from_email || null
        ]
      );

      await client.query(
        `UPDATE emails SET task_id=$1,action_suggested=false WHERE id=$2 AND organization_id=$3`,
        [taskR.rows[0].id, id, s.orgId]
      );

      await client.query(
        `INSERT INTO activity (organization_id,task_id,type,title,detail,actor_user_id)
         VALUES ($1,$2,'task_created','Tarefa criada a partir de comunicação',$3,$4)`,
        [s.orgId, taskR.rows[0].id, email.subject || "Comunicação", s.userId]
      );

      return taskR.rows[0];
    });

    return NextResponse.json({ task, alreadyLinked: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
