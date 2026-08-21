import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth.js";
import { q } from "../../../../lib/db.js";

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export async function GET(request, { params }) {
  try {
    const s = await requireSession(request);
    const { id } = await params;
    const r = await q(
      `SELECT e.*, t.title task_title
       FROM emails e
       LEFT JOIN tasks t ON t.id=e.task_id AND t.organization_id=e.organization_id
       WHERE e.id=$1 AND e.organization_id=$2`,
      [id, s.orgId]
    );
    if (!r.rowCount) return NextResponse.json({ error: "Comunicação não encontrada." }, { status: 404 });
    return NextResponse.json(r.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const s = await requireSession(request);
    const { id } = await params;
    const body = await request.json();
    const fields = [];
    const values = [];
    let i = 1;

    if (body.unread !== undefined) {
      fields.push(`unread=$${i++}`);
      values.push(Boolean(body.unread));
    }

    if (body.actionSuggested !== undefined) {
      fields.push(`action_suggested=$${i++}`);
      values.push(Boolean(body.actionSuggested));
    }

    if (body.taskId !== undefined) {
      const taskId = body.taskId || null;
      if (taskId) {
        const task = await q("SELECT 1 FROM tasks WHERE id=$1 AND organization_id=$2", [taskId, s.orgId]);
        if (!task.rowCount) badRequest("Tarefa inválida para esta organização.");
      }
      fields.push(`task_id=$${i++}`);
      values.push(taskId);
      if (taskId && body.actionSuggested === undefined) {
        fields.push(`action_suggested=$${i++}`);
        values.push(false);
      }
    }

    if (!fields.length) badRequest("Nenhum campo atualizável.");

    values.push(id, s.orgId);
    const r = await q(
      `UPDATE emails SET ${fields.join(",")}
       WHERE id=$${i++} AND organization_id=$${i}
       RETURNING *`,
      values
    );
    if (!r.rowCount) return NextResponse.json({ error: "Comunicação não encontrada." }, { status: 404 });
    return NextResponse.json(r.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
