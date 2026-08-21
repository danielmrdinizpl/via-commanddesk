import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth.js";
import { isPrivileged } from "../../../../lib/permissions.js";
import { q, tx } from "../../../../lib/db.js";
import { scoreTask } from "../../../../lib/scoring.js";

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

function forbidden(message = "FORBIDDEN") {
  const error = new Error(message);
  error.status = 403;
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

export async function GET(request, { params }) {
  try {
    const s = await requireSession(request);
    const { id } = await params;

    const taskResult = await q(
      `SELECT t.*, p.name project_name, u.name owner_name
       FROM tasks t
       LEFT JOIN projects p ON p.id=t.project_id
       LEFT JOIN users u ON u.id=t.owner_id
       WHERE t.organization_id=$1 AND t.id=$2`,
      [s.orgId, id]
    );

    if (!taskResult.rowCount) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }

    const task = taskResult.rows[0];
    const [activityResult, decisionsResult, pendingResult, emailsResult] = await Promise.all([
      q(
        `SELECT a.*, u.name actor_name
         FROM activity a
         LEFT JOIN users u ON u.id=a.actor_user_id
         WHERE a.organization_id=$1 AND a.task_id=$2
         ORDER BY a.created_at DESC
         LIMIT 100`,
        [s.orgId, id]
      ),
      q(
        `SELECT d.*, u.name owner_name
         FROM decisions d
         LEFT JOIN users u ON u.id=d.owner_id
         WHERE d.organization_id=$1 AND d.task_id=$2
         ORDER BY d.created_at DESC`,
        [s.orgId, id]
      ),
      q(
        `SELECT p.*, u.name owner_name
         FROM pending_items p
         LEFT JOIN users u ON u.id=p.owner_id
         WHERE p.organization_id=$1 AND p.task_id=$2
         ORDER BY p.created_at DESC`,
        [s.orgId, id]
      ),
      q(
        `SELECT id, subject, from_name, from_email, received_at, preview, body_excerpt,
                score, unread, action_suggested, web_link, source
         FROM emails
         WHERE organization_id=$1 AND task_id=$2
         ORDER BY received_at DESC NULLS LAST, created_at DESC
         LIMIT 50`,
        [s.orgId, id]
      )
    ]);

    const decisions = decisionsResult.rows;
    const pending = pendingResult.rows;
    const emails = emailsResult.rows;
    const executive = scoreTask(task, decisions, emails, pending);

    return NextResponse.json({
      task,
      executive,
      summary: {
        activity: activityResult.rowCount,
        pendingDecisions: decisions.filter((item) => item.status === "Pendente").length,
        openPending: pending.filter((item) => item.status === "Aberta").length,
        emails: emails.length,
        actionEmails: emails.filter((item) => item.unread && item.action_suggested).length
      },
      activity: activityResult.rows,
      decisions,
      pending,
      emails
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const s = await requireSession(request);
    const body = await request.json();
    const { id } = await params;

    const currentR = await q(
      `SELECT id,owner_id FROM tasks WHERE organization_id=$1 AND id=$2`,
      [s.orgId, id]
    );
    if (!currentR.rowCount) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }
    const current = currentR.rows[0];

    if (!isPrivileged(s) && current.owner_id !== s.userId) {
      forbidden("Membros só podem editar tarefas atribuídas a si mesmos.");
    }
    if (!isPrivileged(s) && body.owner_id !== undefined && body.owner_id !== s.userId) {
      forbidden("Membros não podem transferir tarefas para outro responsável.");
    }

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
