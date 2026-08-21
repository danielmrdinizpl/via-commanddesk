import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth.js";
import { q } from "../../../../lib/db.js";

const statuses = new Set(["Planejado", "Em andamento", "Pausado", "Concluído"]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function requireManager(session) {
  if (!new Set(["admin", "manager"]).has(session.role)) {
    const error = new Error("FORBIDDEN");
    error.status = 403;
    throw error;
  }
}

export async function PATCH(request, { params }) {
  try {
    const s = await requireSession(request);
    requireManager(s);
    const { id } = await params;
    const body = await request.json();

    const fields = [];
    const values = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) badRequest("Nome do projeto obrigatório.");
      const duplicate = await q(
        "SELECT 1 FROM projects WHERE organization_id=$1 AND lower(name)=lower($2) AND id<>$3 LIMIT 1",
        [s.orgId, name, id]
      );
      if (duplicate.rowCount) badRequest("Já existe outro projeto com esse nome.");
      fields.push(`name=$${i++}`);
      values.push(name);
    }

    if (body.status !== undefined) {
      if (!statuses.has(body.status)) badRequest("Status de projeto inválido.");
      fields.push(`status=$${i++}`);
      values.push(body.status);
    }

    if (body.progress !== undefined) {
      const progress = Number(body.progress);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        badRequest("Progresso deve estar entre 0 e 100.");
      }
      fields.push(`progress=$${i++}`);
      values.push(progress);
    }

    if (body.ownerId !== undefined) {
      const ownerId = body.ownerId || null;
      if (ownerId) {
        const owner = await q(
          "SELECT 1 FROM users WHERE id=$1 AND organization_id=$2",
          [ownerId, s.orgId]
        );
        if (!owner.rowCount) badRequest("Responsável inválido para esta organização.");
      }
      fields.push(`owner_id=$${i++}`);
      values.push(ownerId);
    }

    if (!fields.length) {
      return NextResponse.json({ error: "Nenhum campo atualizável." }, { status: 400 });
    }

    values.push(s.orgId, id);
    const r = await q(
      `UPDATE projects SET ${fields.join(",")}, updated_at=NOW()
       WHERE organization_id=$${i++} AND id=$${i}
       RETURNING *`,
      values
    );

    if (!r.rowCount) {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
