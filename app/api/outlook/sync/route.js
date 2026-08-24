import { NextResponse } from "next/server";
import { requireSession, demoModeEnabled } from "../../../../lib/auth.js";
import { isPrivileged } from "../../../../lib/permissions.js";
import { graphAccessToken, graphGet } from "../../../../lib/microsoft.js";
import { q } from "../../../../lib/db.js";
import { classifyEmail } from "../../../../lib/scoring.js";

const demoMessages = [
  {
    id: "demo-outlook-001",
    subject: "ACME | retorno sobre proposta comercial",
    from: { emailAddress: { name: "Mariana Costa", address: "mariana@acme.com.br" } },
    receivedDateTime: new Date().toISOString(),
    bodyPreview: "Precisamos validar a condição comercial e receber a minuta revisada até amanhã.",
    isRead: false,
    webLink: null
  },
  {
    id: "demo-outlook-002",
    subject: "Projeto Atlas — documentação pendente",
    from: { emailAddress: { name: "Rafael Silva", address: "rafael@parceiro.com.br" } },
    receivedDateTime: new Date(Date.now()-3600000).toISOString(),
    bodyPreview: "Favor enviar a documentação técnica atualizada para concluirmos a homologação.",
    isRead: false,
    webLink: null
  }
];

export async function POST(request) {
  try {
    const s = await requireSession(request);
    const tasksR = await q(
      `SELECT t.*, p.name project_name
       FROM tasks t
       LEFT JOIN projects p ON p.id=t.project_id
       WHERE t.organization_id=$1
         AND t.status <> 'Concluída'
         AND ($2::boolean OR t.owner_id=$3)`,
      [s.orgId, isPrivileged(s), s.userId]
    );

    let messages;
    if (demoModeEnabled()) {
      messages = demoMessages.map((m, i) => ({ ...m, id: `${m.id}-${Math.floor(Date.now()/60000)}-${i}` }));
    } else {
      const accessToken = await graphAccessToken(s.orgId, s.userId);
      const result = await graphGet(
        accessToken,
        "/me/mailFolders/inbox/messages?$select=id,subject,from,receivedDateTime,bodyPreview,isRead,webLink&$top=30&$orderby=receivedDateTime%20desc"
      );
      messages = result.value || [];
    }

    let inserted = 0, linked = 0, actions = 0;

    for (const m of messages) {
      const c = classifyEmail(m, tasksR.rows);
      const fromName = m.from?.emailAddress?.name || "";
      const fromEmail = m.from?.emailAddress?.address || "";
      const r = await q(
        `INSERT INTO emails
         (organization_id,user_id,outlook_message_id,subject,from_name,from_email,received_at,preview,
          task_id,score,unread,action_suggested,web_link,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (organization_id,user_id,outlook_message_id) DO NOTHING
         RETURNING id`,
        [
          s.orgId, s.userId, m.id, m.subject || "(sem assunto)", fromName, fromEmail,
          m.receivedDateTime || new Date().toISOString(), m.bodyPreview || "",
          c.taskId, c.score, !m.isRead, c.actionSuggested, m.webLink || null,
          demoModeEnabled() ? "demo" : "microsoft_graph"
        ]
      );
      if (r.rowCount) {
        inserted++;
        if (c.taskId) linked++;
        if (c.actionSuggested) actions++;
      }
    }

    return NextResponse.json({ ok: true, inserted, linked, actions, mode: demoModeEnabled() ? "demo" : "microsoft_graph" });
  } catch (error) {
    const status = error.status || (error.message === "OUTLOOK_NOT_CONNECTED" ? 409 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}
