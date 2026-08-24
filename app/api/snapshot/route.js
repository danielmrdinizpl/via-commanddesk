import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth.js";
import { q } from "../../../lib/db.js";
import { scoreTask } from "../../../lib/scoring.js";

export async function GET(request) {
  try {
    const s = await requireSession(request);
    const org = s.orgId;

    const [tasksR, projectsR, usersR, emailsR, decisionsR, pendingR] = await Promise.all([
      q(`SELECT t.*, p.name project_name, u.name owner_name
         FROM tasks t
         LEFT JOIN projects p ON p.id=t.project_id
         LEFT JOIN users u ON u.id=t.owner_id
         WHERE t.organization_id=$1
         ORDER BY t.updated_at DESC`, [org]),
      q(`SELECT * FROM projects WHERE organization_id=$1 ORDER BY created_at`, [org]),
      q(`SELECT id,name,email,role,department,job_title
         FROM users WHERE organization_id=$1 ORDER BY name`, [org]),
      q(`SELECT * FROM emails
         WHERE organization_id=$1 AND user_id=$2
         ORDER BY received_at DESC LIMIT 100`, [org, s.userId]),
      q(`SELECT * FROM decisions WHERE organization_id=$1 ORDER BY created_at DESC`, [org]),
      q(`SELECT * FROM pending_items WHERE organization_id=$1 ORDER BY due_date NULLS LAST`, [org])
    ]);

    const tasks = tasksR.rows;
    const emails = emailsR.rows;
    const decisions = decisionsR.rows;
    const pending = pendingR.rows;

    const ranked = tasks
      .filter((t) => t.status !== "Concluída")
      .map((task) => ({ ...task, executive: scoreTask(task, decisions, emails, pending) }))
      .sort((a, b) => b.executive.score - a.executive.score);

    const metrics = {
      open: tasks.filter((t) => t.status !== "Concluída").length,
      blocked: tasks.filter((t) => t.status === "Bloqueada").length,
      overdue: tasks.filter((t) => t.status !== "Concluída" && t.due_date && new Date(t.due_date) < new Date()).length,
      decisions: decisions.filter((d) => d.status === "Pendente").length,
      mailActions: emails.filter((e) => e.unread && e.action_suggested).length,
      commitments: emails.filter((e) => e.unread && e.action_suggested && !e.task_id).length
    };

    return NextResponse.json({
      user: { name: s.name, email: s.email, role: s.role },
      metrics,
      tasks,
      ranked: ranked.slice(0, 10),
      projects: projectsR.rows,
      team: usersR.rows,
      emails: emails.slice(0, 30),
      decisions,
      pending
    });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
