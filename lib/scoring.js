const HIGH = new Set(["Alta", "Crítica"]);

function daysUntil(date) {
  if (!date) return 999;
  const today = new Date();
  today.setHours(0,0,0,0);
  const due = new Date(`${date}T12:00:00`);
  return Math.round((due - today) / 86400000);
}

export function scoreTask(task, decisions = [], emails = [], pending = []) {
  if (!task || task.status === "Concluída") return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  const dd = daysUntil(task.due_date);

  if (task.status === "Bloqueada") { score += 35; reasons.push("bloqueada"); }
  if (dd < 0) { score += 30; reasons.push("atrasada"); }
  else if (dd === 0) { score += 20; reasons.push("vence hoje"); }
  else if (dd <= 2) { score += 8; reasons.push("prazo próximo"); }

  if (HIGH.has(task.priority)) { score += 20; reasons.push("prioridade alta"); }
  else if (task.priority === "Média") score += 8;

  const dec = decisions.filter((d) => d.task_id === task.id && d.status === "Pendente").length;
  const mail = emails.filter((e) => e.task_id === task.id && e.action_suggested && e.unread).length;
  const overdue = pending.filter((p) => p.task_id === task.id && p.status === "Aberta" && p.due_date && daysUntil(p.due_date) < 0).length;

  if (dec) { score += Math.min(36, dec * 18); reasons.push(`${dec} decisão(ões)`); }
  if (mail) { score += Math.min(24, mail * 12); reasons.push(`${mail} e-mail(s) com ação`); }
  if (overdue) { score += Math.min(24, overdue * 12); reasons.push(`${overdue} pendência(s) vencida(s)`); }

  return { score: Math.min(100, score), reasons: [...new Set(reasons)].slice(0, 4) };
}

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function tokens(s) {
  return norm(s).split(/[^a-z0-9@._-]+/).filter((x) => x.length >= 3);
}

export function classifyEmail(message, tasks) {
  const subject = norm(message.subject);
  const preview = norm(message.bodyPreview || message.preview);
  const from = norm(message.from?.emailAddress?.address || message.from_email);
  const hay = `${subject} ${preview} ${from}`;
  let best = { task: null, score: 0 };

  for (const task of tasks.filter((t) => t.monitor_outlook)) {
    let score = 0;
    const titleTokens = tokens(task.title);
    const keywordTokens = tokens((task.mail_keywords || []).join(" "));
    const projectTokens = tokens(task.project_name || "");

    score += titleTokens.filter((x) => hay.includes(x)).length * 12;
    score += keywordTokens.filter((x) => hay.includes(x)).length * 16;
    score += projectTokens.filter((x) => hay.includes(x)).length * 7;

    if (task.mail_domain && from.endsWith(norm(task.mail_domain))) score += 28;
    if (task.mail_contact && from === norm(task.mail_contact)) score += 35;

    if (score > best.score) best = { task, score: Math.min(100, score) };
  }

  const actionWords = [
    "preciso", "precisamos", "favor", "prazo", "ate ", "aprovar", "retorno",
    "enviar", "pendente", "urgente", "solicito", "aguardo", "confirmar",
    "proposta", "contrato", "documentacao"
  ];
  const actionSuggested = actionWords.some((x) => hay.includes(norm(x)));

  return {
    taskId: best.score >= 65 ? best.task?.id || null : null,
    score: best.score,
    actionSuggested
  };
}
