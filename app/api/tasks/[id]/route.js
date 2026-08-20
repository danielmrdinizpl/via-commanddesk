import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth.js";
import { q, tx } from "../../../../lib/db.js";

const allowed = new Set([
  "status",
  "priority",
  "title",
  "description",
  "due_date",
  "department",
  "monitor_outlook",
  "project_id",
  "owner_id"
]);
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

export async function PATCH(request, { params }) {
  try {
    const s = await requireSession(request);
    const body = await request.json();

    if (body.status !== undefined && !statuses.has(body.status)) badRequest("Status inválido.");
    if (body.priority !== undefined && !priorities.has(body.priority)) badRequest("Prioridade inválida.");
    if (body.title !== undefined && !String(body.title).trim()) badRequest("Título obrigatório.");

    await assertOrgReferences(
      s.orgId,
      body.project_id === undefined ? null : body.project_id,
      body.owner_id === undefined ? null : body.owner_id
    );

    const fields = [];
    const values = [];
    const changedKeys = [];
    let i = 1;

    for (const [key, value] of Object.entries(body)) {
      if (!allowed.has(key)) continue;
      fields.push(`${key}=$${i++}`);
      values.push(key === "title" ? String(value).trim() : value);
      changedKeys.push(key);
    }

    if (!fields.length) {
      return NextResponse.json({ error: "Nenhum campo atualizável." }, { status: 400 });
    }

    const { id } = await params;
    values.push(s.orgId, id);

    const task = await tx(async (client) => {
      const r = await client.query(
        `UPDATE tasks SET ${fields.join(",")}, updated_at=NOW()
         WHERE organization_id=$${i++} AND id=$${i}
         RETURNING *`,
        values
      );

      if (!r.rowCount) return null;

      await client.query(
        `INSERT INTO activity (organization_id,task_id,type,title,detail,actor_user_id)
         VALUES ($1,$2,'task_updated','Tarefa atualizada',$3,$4)`,
        [s.orgId, id, `Campos alterados: ${changedKeys.join(", ")}`, s.userId]
      );

      return r.rows[0];
    });

    if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
