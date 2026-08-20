import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth.js";
import { q, tx } from "../../../lib/db.js";

const statuses = new Set(["A Fazer", "Em Andamento", "Bloqueada", "Concluída"]);
const priorities = new Set(["Alta", "Média", "Baixa"]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

async function assertOrgReferences(orgId, projectId, ownerId) {
  if (projectId) {
    const project = await q(
      "SELECT 1 FROM projects WHERE id=$1 AND organization_id=$2",
      [projectId, orgId]
    );
    if (!project.rowCount) badRequest("Projeto inválido para esta organização.");
  }

  if (ownerId) {
    const owner = await q(
      "SELECT 1 FROM users WHERE id=$1 AND organization_id=$2",
      [ownerId, orgId]
    );
    if (!owner.rowCount) badRequest("Responsável inválido para esta organização.");
  }
}

export async function GET(request) {
  try {
    const s = await requireSession(request);
    const r = await q(
      `SELECT t.*, p.name project_name, u.name owner_name
       FROM tasks t
       LEFT JOIN projects p ON p.id=t.project_id
       LEFT JOIN users u ON u.id=t.owner_id
       WHERE t.organization_id=$1
       ORDER BY t.updated_at DESC`,
      [s.orgId]
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
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "Título obrigatório." }, { status: 400 });

    const status = body.status || "A Fazer";
    const priority = body.priority || "Média";
    const projectId = body.projectId || null;
    const ownerId = body.ownerId || s.userId;

    if (!statuses.has(status)) badRequest("Status inválido.");
    if (!priorities.has(priority)) badRequest("Prioridade inválida.");
    await assertOrgReferences(s.orgId, projectId, ownerId);

    const task = await tx(async (client) => {
      const r = await client.query(
        `INSERT INTO tasks
         (organization_id,title,description,status,priority,department,project_id,owner_id,due_date,
          monitor_outlook,mail_keywords,mail_domain,mail_contact,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          s.orgId,
          title,
          body.description || "",
          status,
          priority,
          body.department || "Geral",
          projectId,
          ownerId,
          body.dueDate || null,
          !!body.monitorOutlook,
          Array.isArray(body.mailKeywords) ? body.mailKeywords : [],
          body.mailDomain || null,
          body.mailContact || null,
          s.userId
        ]
      );

      await client.query(
        `INSERT INTO activity (organization_id,task_id,type,title,detail,actor_user_id)
         VALUES ($1,$2,'task_created','Tarefa criada',$3,$4)`,
        [s.orgId, r.rows[0].id, title, s.userId]
      );

      return r.rows[0];
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
