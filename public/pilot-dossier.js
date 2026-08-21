(() => {
  const style = document.createElement('style');
  style.textContent = `
    #taskDossier{margin-top:16px;border-top:1px solid #eceef0;padding-top:14px}
    #taskDossier[hidden]{display:none}
    .dos-head{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
    .dos-head h3{margin:0;font-size:13px}.dos-score{display:flex;align-items:center;gap:7px;font-size:10px;color:#6f747b}
    .dos-score b{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#fff3ea;color:#ff6b19;font-size:15px}
    .dos-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px}
    .dos-kpi{border:1px solid #eceef0;border-radius:9px;padding:8px;background:#fafafa}.dos-kpi b{display:block;font-size:15px}.dos-kpi small{font-size:8px;color:#858a91}
    .dos-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;max-height:310px;overflow:auto;padding-right:3px}
    .dos-box{border:1px solid #eceef0;border-radius:10px;background:#fff;min-height:90px}.dos-box h4{margin:0;padding:9px 10px;border-bottom:1px solid #f0f1f2;font-size:10px}
    .dos-list{padding:4px 10px 8px}.dos-item{padding:7px 0;border-bottom:1px solid #f2f2f3}.dos-item:last-child{border-bottom:0}.dos-item b{font-size:9px}.dos-item small{display:block;color:#858a91;font-size:8px;margin-top:2px;line-height:1.35}
    .dos-empty{padding:12px 10px;color:#969ba1;font-size:8.5px}.dos-reasons{font-size:8px;color:#777;margin-top:2px}
    @media(max-width:700px){.dos-summary{grid-template-columns:1fr 1fr}.dos-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const dialog = document.querySelector('#modal .dialog');
  const actions = dialog?.querySelector('.actions');
  if (!dialog || !actions) return;

  const panel = document.createElement('section');
  panel.id = 'taskDossier';
  panel.hidden = true;
  dialog.insertBefore(panel, actions);

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const date = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const empty = (text) => `<div class="dos-empty">${esc(text)}</div>`;

  function items(rows, mapper, emptyText) {
    if (!rows?.length) return empty(emptyText);
    return `<div class="dos-list">${rows.map(mapper).join('')}</div>`;
  }

  function render(data) {
    const summary = data.summary || {};
    const executive = data.executive || { score: 0, reasons: [] };
    panel.innerHTML = `
      <div class="dos-head">
        <div><h3>Dossiê Operacional</h3><div class="dos-reasons">${esc((executive.reasons || []).join(' · ') || 'Sem sinais críticos adicionais')}</div></div>
        <div class="dos-score"><span>Score executivo</span><b>${Number(executive.score || 0)}</b></div>
      </div>
      <div class="dos-summary">
        <div class="dos-kpi"><b>${summary.activity || 0}</b><small>eventos</small></div>
        <div class="dos-kpi"><b>${summary.pendingDecisions || 0}</b><small>decisões pendentes</small></div>
        <div class="dos-kpi"><b>${summary.openPending || 0}</b><small>pendências abertas</small></div>
        <div class="dos-kpi"><b>${summary.emails || 0}</b><small>e-mails vinculados</small></div>
      </div>
      <div class="dos-grid">
        <div class="dos-box"><h4>Histórico</h4>${items(data.activity, (x) => `<div class="dos-item"><b>${esc(x.title)}</b><small>${esc(x.detail || '')}${x.actor_name ? ' · ' + esc(x.actor_name) : ''} · ${esc(date(x.created_at))}</small></div>`, 'Nenhum evento registrado.')}</div>
        <div class="dos-box"><h4>Decisões</h4>${items(data.decisions, (x) => `<div class="dos-item"><b>${esc(x.title)}</b><small>${esc(x.status)}${x.owner_name ? ' · ' + esc(x.owner_name) : ''}${x.detail ? ' · ' + esc(x.detail) : ''}</small></div>`, 'Nenhuma decisão vinculada.')}</div>
        <div class="dos-box"><h4>Pendências</h4>${items(data.pending, (x) => `<div class="dos-item"><b>${esc(x.title)}</b><small>${esc(x.status)}${x.origin ? ' · ' + esc(x.origin) : ''}${x.due_date ? ' · prazo ' + esc(new Date(x.due_date).toLocaleDateString('pt-BR')) : ''}</small></div>`, 'Nenhuma pendência vinculada.')}</div>
        <div class="dos-box"><h4>Comunicações</h4>${items(data.emails, (x) => `<div class="dos-item"><b>${esc(x.subject || 'Sem assunto')}</b><small>${esc(x.from_name || x.from_email || 'Remetente')} · score ${Number(x.score || 0)}${x.action_suggested ? ' · ação sugerida' : ''}</small></div>`, 'Nenhum e-mail vinculado.')}</div>
      </div>`;
  }

  async function loadDossier(id) {
    panel.hidden = false;
    panel.innerHTML = '<div class="dos-empty">Carregando Dossiê Operacional...</div>';
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      render(data);
    } catch (error) {
      panel.innerHTML = `<div class="dos-empty">Falha ao carregar dossiê: ${esc(error.message)}</div>`;
    }
  }

  function hideDossier() {
    panel.hidden = true;
    panel.innerHTML = '';
  }

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.task[data-task-id]');
    if (card) {
      loadDossier(card.dataset.taskId);
      return;
    }
    if (event.target.closest('#add') || event.target.closest('[onclick="openTask()"]')) hideDossier();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.task[data-task-id]')) {
      loadDossier(event.target.dataset.taskId);
    }
  });

  window.CommandDeskDossier = { load: loadDossier, hide: hideDossier };
})();

(() => {
  if (document.querySelector('script[data-commanddesk-entities]')) return;
  const script = document.createElement('script');
  script.src = '/pilot-entities.js';
  script.dataset.commanddeskEntities = 'true';
  document.body.appendChild(script);
})();
