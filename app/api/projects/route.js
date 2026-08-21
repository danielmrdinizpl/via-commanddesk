import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth.js";
import { q } from "../../../lib/db.js";

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

export async function POST(request) {
  try {
    const s = await requireSession(request);
    requireManager(s);
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) badRequest("Nome do projeto obrigatório.");

    const status = body.status || "Em andamento";
    if (!statuses.has(status)) badRequest("Status de projeto inválido.");

    const progress = Number(body.progress ?? 0);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      badRequest("Progresso deve estar entre 0 e 100.");
    }

    const ownerId = body.ownerId || null;
    if (ownerId) {
      const owner = await q(
        "SELECT 1 FROM users WHERE id=$1 AND organization_id=$2",
        [ownerId, s.orgId]
      );
      if (!owner.rowCount) badRequest("Responsável inválido para esta organização.");
    }

    const duplicate = await q(
      "SELECT 1 FROM projects WHERE organization_id=$1 AND lower(name)=lower($2) LIMIT 1",
      [s.orgId, name]
    );
    if (duplicate.rowCount) badRequest("Já existe um projeto com esse nome.");

    const r = await q(
      `INSERT INTO projects (organization_id,name,status,progress,owner_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [s.orgId, name, status, progress, ownerId]
    );

    return NextResponse.json(r.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
