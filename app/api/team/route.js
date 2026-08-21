import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth.js";
import { q } from "../../../lib/db.js";

const roles = new Set(["admin", "manager", "member"]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function requireAdmin(session) {
  if (session.role !== "admin") {
    const error = new Error("FORBIDDEN");
    error.status = 403;
    throw error;
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request);
    requireAdmin(s);
    const body = await request.json();

    const name = String(body.name || "").trim();
    if (!name) badRequest("Nome do integrante obrigatório.");

    const email = String(body.email || "").trim().toLowerCase() || null;
    const role = body.role || "member";
    if (!roles.has(role)) badRequest("Papel de usuário inválido.");

    const department = String(body.department || "Geral").trim() || "Geral";
    const jobTitle = String(body.jobTitle || "").trim() || null;

    if (email) {
      const duplicate = await q(
        "SELECT 1 FROM users WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1",
        [s.orgId, email]
      );
      if (duplicate.rowCount) badRequest("Já existe um integrante com esse e-mail.");
    }

    const r = await q(
      `INSERT INTO users (organization_id,email,name,role,department,job_title)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,name,email,role,department,job_title`,
      [s.orgId, email, name, role, department, jobTitle]
    );

    return NextResponse.json(r.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
