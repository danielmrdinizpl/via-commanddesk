(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const date = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const roleLabel = (role) => ({ admin: 'Administrador', manager: 'Gestor', member: 'Membro' }[role] || role || '—');

  const style = document.createElement('style');
  style.textContent = `
    .ops-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ops-card{border:1px solid #e9eaec;border-radius:13px;padding:15px;background:#fff}.ops-card h3{margin:0 0 5px;font-size:12px}.ops-card p{margin:0 0 11px;color:#7d8289;font-size:9px;line-height:1.5}.ops-k{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#969ba1}.ops-v{font-weight:800;font-size:11px;margin-top:3px}.ops-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.ops-badge{display:inline-block;border-radius:99px;padding:4px 7px;font-size:8px;font-weight:900;background:#f2f3f4;color:#626870}.ops-badge.ok{background:#edf8eb;color:#3d8439}.ops-badge.warn{background:#fff3ea;color:#d95c12}.ops-badge.off{background:#f3f3f4;color:#777}.ops-btn{border:1px solid #dfe1e3;background:#fff;border-radius:8px;padding:8px 10px;font-size:9px;font-weight:800;cursor:pointer}.ops-btn.primary{background:#ff6b19;border-color:#ff6b19;color:#fff}.ops-btn.danger{color:#c34046}.ops-btn:disabled{opacity:.45;cursor:not-allowed}
    .comm-toolbar{display:flex;gap:7px;align-items:center;padding:0 15px 12px;flex-wrap:wrap}.comm-filter{border:1px solid #e1e3e5;background:#fff;border-radius:99px;padding:6px 9px;font-size:8px;font-weight:800;cursor:pointer}.comm-filter.active{background:#fff3ea;color:#ff6b19;border-color:#ffd4b8}.comm-summary{margin-left:auto;color:#858a91;font-size:8.5px}.comm-row{cursor:pointer}.comm-row:hover{background:#fff7f1}.comm-subject{font-weight:700}.comm-pill{font-size:7.5px;padding:3px 6px;border-radius:99px;background:#f2f3f4;white-space:nowrap}.comm-pill.attn{background:#fff0e6;color:#d95c12}.comm-pill.read{color:#8b9096}.comm-pill.unread{background:#edf5ff;color:#356c9e}
    #communicationModal .dialog{width:min(720px,95vw)}.comm-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #eee;padding-bottom:12px}.comm-detail-head h2{margin:2px 0 5px;font-size:16px}.comm-detail-head p{margin:0;color:#7d8289;font-size:9px}.comm-preview{white-space:pre-wrap;line-height:1.6;border:1px solid #eceef0;background:#fafafa;border-radius:10px;padding:12px;margin:12px 0;font-size:10px}.comm-controls{display:grid;grid-template-columns:1fr 1fr;gap:9px}.comm-controls label,.settings-form label,.entity-field{font-size:8px;font-weight:800;color:#747980;display:grid;gap:5px}.comm-controls select,.comm-controls input,.settings-form input{width:100%;padding:9px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#24272b}.comm-actions{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:13px}.comm-actions>div{display:flex;gap:7px;flex-wrap:wrap}
    .settings-layout{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.settings-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.settings-form .full{grid-column:1/-1}.settings-form input[readonly],.settings-form input:disabled{background:#f6f7f8;color:#777}.settings-meta{display:grid;gap:10px}.settings-meta .ops-card{box-shadow:none}.settings-save{grid-column:1/-1;display:flex;justify-content:flex-end;margin-top:4px}
    @media(max-width:900px){.ops-grid{grid-template-columns:1fr}.settings-layout{grid-template-columns:1fr}.comm-controls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function waitState() {
    for (let i = 0; i < 80; i++) {
      if (window.S || typeof S !== 'undefined' && S) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // INTEGRAÇÕES
  let integrationState = null;
  async function loadIntegrations() {
    const host = document.querySelector('#integration');
    if (!host) return;
    host.innerHTML = '<div class="empty">Carregando integrações...</div>';
    try {
      integrationState = await request('/api/integrations');
      const ms = integrationState.microsoft || {};
      const status = integrationState.demo
        ? '<span class="ops-badge warn">MODO DEMO</span>'
        : ms.connected
          ? '<span class="ops-badge ok">CONECTADO</span>'
          : '<span class="ops-badge off">DESCONECTADO</span>';
      const connectionText = integrationState.demo
        ? 'A sincronização usa mensagens simuladas. Nenhum dado Microsoft é acessado.'
        : ms.connected
          ? `Conectado em ${date(ms.connectedAt)}. Permissões: ${esc(ms.scopes || 'Microsoft Graph')}`
          : ms.configured
            ? 'Aplicativo Microsoft configurado e pronto para autenticação.'
            : 'Credenciais Microsoft ainda não estão configuradas no ambiente.';

      host.className = '';
      host.innerHTML = `<div class="ops-grid">
        <div class="ops-card">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3>Microsoft 365 / Outlook</h3>${status}</div>
          <p>${connectionText}</p>
          <div class="ops-k">Função ativa</div><div class="ops-v">Leitura de e-mails + classificação + vínculo com tarefas</div>
          <div class="ops-actions">
            <button class="ops-btn primary" id="opsSyncMicrosoft" ${ms.syncAvailable ? '' : 'disabled'}>Sincronizar agora</button>
            ${integrationState.demo ? '<button class="ops-btn" disabled>Conexão real desativada no Demo</button>' : ms.connected ? '<button class="ops-btn danger" id="opsDisconnectMicrosoft">Desconectar</button>' : `<button class="ops-btn" id="opsConnectMicrosoft" ${ms.configured ? '' : 'disabled'}>Conectar Microsoft 365</button>`}
          </div>
        </div>
        <div class="ops-card">
          <h3>Motor de classificação</h3>
          <p>Analisa assunto, remetente e contexto para sugerir vínculo e ação operacional.</p>
          <div class="ops-k">Critério executivo</div><div class="ops-v">Score + ação sugerida + tarefa relacionada</div>
          <div class="ops-actions"><button class="ops-btn" id="opsGoCommunications">Abrir Comunicações</button></div>
        </div>
        <div class="ops-card">
          <h3>Governança da integração</h3>
          <p>O CommandDesk utiliza apenas as permissões necessárias para leitura das mensagens autorizadas.</p>
          <div class="ops-k">Escopo atual</div><div class="ops-v">User.Read · Mail.Read</div>
          <div class="ops-k" style="margin-top:10px">Gravação no Outlook</div><div class="ops-v">Não habilitada</div>
        </div>
      </div>`;

      document.querySelector('#opsSyncMicrosoft')?.addEventListener('click', async () => {
        try {
          const result = await request('/api/outlook/sync', { method: 'POST', body: '{}' });
          toast(`${result.inserted} nova(s) mensagem(ns); ${result.linked} vinculada(s); ${result.actions} ação(ões).`);
          await load();
          renderCommunications();
        } catch (error) { toast(error.message); }
      });
      document.querySelector('#opsConnectMicrosoft')?.addEventListener('click', () => { location.href = '/api/auth/login'; });
      document.querySelector('#opsDisconnectMicrosoft')?.addEventListener('click', async () => {
        if (!confirm('Desconectar sua conta Microsoft 365 do CommandDesk?')) return;
        try {
          await request('/api/integrations/microsoft', { method: 'DELETE' });
          toast('Microsoft 365 desconectado.');
          await loadIntegrations();
        } catch (error) { toast(error.message); }
      });
      document.querySelector('#opsGoCommunications')?.addEventListener('click', () => view('communications'));
    } catch (error) {
      host.innerHTML = `<div class="empty">Falha ao carregar integrações: ${esc(error.message)}</div>`;
    }
  }

  // COMUNICAÇÕES
  let commFilter = 'all';
  const communicationModal = document.createElement('div');
  communicationModal.className = 'modal';
  communicationModal.id = 'communicationModal';
  communicationModal.innerHTML = '<div class="dialog"><div id="communicationDetail"></div></div>';
  document.body.appendChild(communicationModal);
  communicationModal.addEventListener('click', (event) => { if (event.target === communicationModal) communicationModal.classList.remove('open'); });

  function ensureCommunications() {
    const section = document.querySelector('#communications .card');
    const table = section?.querySelector('.table');
    if (!section || !table) return;
    const head = section.querySelector('.head');
    if (head && !head.querySelector('#commRefresh')) {
      const existing = head.querySelector('#sync2');
      if (existing) existing.textContent = 'Sincronizar Outlook';
    }
    if (!section.querySelector('#commToolbar')) {
      const toolbar = document.createElement('div');
      toolbar.id = 'commToolbar';
      toolbar.className = 'comm-toolbar';
      toolbar.innerHTML = `
        <button class="comm-filter active" data-cf="all">Todas</button>
        <button class="comm-filter" data-cf="unread">Não lidas</button>
        <button class="comm-filter" data-cf="action">Exigem ação</button>
        <button class="comm-filter" data-cf="linked">Vinculadas</button>
        <button class="comm-filter" data-cf="unlinked">Sem tarefa</button>
        <span class="comm-summary" id="commSummary"></span>`;
      table.before(toolbar);
      toolbar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-cf]');
        if (!button) return;
        commFilter = button.dataset.cf;
        toolbar.querySelectorAll('.comm-filter').forEach((b) => b.classList.toggle('active', b === button));
        renderCommunications();
      });
    }
    table.querySelector('thead').innerHTML = '<tr><th>Recebido</th><th>Remetente</th><th>Assunto</th><th>Score</th><th>Vínculo</th><th>Status</th></tr>';
  }

  function filteredEmails() {
    const emails = S?.emails || [];
    if (commFilter === 'unread') return emails.filter((e) => e.unread);
    if (commFilter === 'action') return emails.filter((e) => e.action_suggested);
    if (commFilter === 'linked') return emails.filter((e) => e.task_id);
    if (commFilter === 'unlinked') return emails.filter((e) => !e.task_id);
    return emails;
  }

  function renderCommunications() {
    ensureCommunications();
    const tbody = document.querySelector('#mailTable');
    if (!tbody || typeof S === 'undefined' || !S) return;
    const emails = filteredEmails();
    const tasks = S.tasks || [];
    const total = S.emails?.length || 0;
    const actions = S.emails?.filter((e) => e.action_suggested).length || 0;
    const unread = S.emails?.filter((e) => e.unread).length || 0;
    const summary = document.querySelector('#commSummary');
    if (summary) summary.textContent = `${emails.length}/${total} exibidas · ${unread} não lidas · ${actions} exigem ação`;
    tbody.innerHTML = emails.length ? emails.map((email) => {
      const task = tasks.find((t) => t.id === email.task_id);
      return `<tr class="comm-row" data-email-id="${esc(email.id)}">
        <td>${esc(date(email.received_at))}</td>
        <td><b>${esc(email.from_name || email.from_email || 'Remetente')}</b><small style="display:block;color:#8b9096">${esc(email.from_email || '')}</small></td>
        <td><span class="comm-subject">${esc(email.subject || 'Sem assunto')}</span><small style="display:block;color:#8b9096;margin-top:3px">${esc((email.preview || '').slice(0,90))}</small></td>
        <td><b>${Number(email.score || 0)}</b></td>
        <td>${task ? `<span class="comm-pill">${esc(task.title)}</span>` : '<span class="comm-pill">Sem tarefa</span>'}</td>
        <td>${email.action_suggested ? '<span class="comm-pill attn">Ação sugerida</span>' : email.unread ? '<span class="comm-pill unread">Não lida</span>' : '<span class="comm-pill read">Lida</span>'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Nenhuma comunicação neste filtro.</td></tr>';
  }

  async function refreshAfterCommunicationChange() {
    await load();
    renderCommunications();
    const badge = document.querySelector('#mailBadge');
    if (badge) badge.textContent = (S?.emails || []).filter((e) => e.unread && e.action_suggested).length;
  }

  async function openCommunication(id) {
    const host = communicationModal.querySelector('#communicationDetail');
    host.innerHTML = '<div class="empty">Carregando comunicação...</div>';
    communicationModal.classList.add('open');
    try {
      const email = await request(`/api/communications/${encodeURIComponent(id)}`);
      const taskOptions = (S?.tasks || []).map((task) => `<option value="${esc(task.id)}" ${task.id === email.task_id ? 'selected' : ''}>${esc(task.title)}</option>`).join('');
      host.innerHTML = `
        <div class="comm-detail-head">
          <div><span class="ops-badge ${email.action_suggested ? 'warn' : email.unread ? '' : 'off'}">${email.action_suggested ? 'AÇÃO SUGERIDA' : email.unread ? 'NÃO LIDA' : 'LIDA'}</span><h2>${esc(email.subject || 'Sem assunto')}</h2><p>${esc(email.from_name || email.from_email || 'Remetente')} · ${esc(email.from_email || '')} · ${esc(date(email.received_at))}</p></div>
          <div style="text-align:right"><div class="ops-k">Score</div><div style="font-size:25px;font-weight:900;color:#ff6b19">${Number(email.score || 0)}</div></div>
        </div>
        <div class="comm-preview">${esc(email.preview || email.body_excerpt || 'Sem prévia disponível.')}</div>
        <div class="comm-controls">
          <label>Tarefa vinculada<select id="commTask"><option value="">Sem tarefa</option>${taskOptions}</select></label>
          <label>Prioridade ao criar tarefa<select id="commPriority"><option ${Number(email.score||0)>=65?'selected':''}>Alta</option><option ${Number(email.score||0)<65?'selected':''}>Média</option><option>Baixa</option></select></label>
          <label>Prazo da nova tarefa<input id="commDue" type="date"></label>
          <label>Origem<input value="${esc(email.source || 'microsoft_graph')}" readonly></label>
        </div>
        <div class="comm-actions">
          <div><button class="ops-btn" id="commClose">Fechar</button>${email.web_link ? '<button class="ops-btn" id="commOpenOutlook">Abrir no Outlook</button>' : ''}</div>
          <div>${email.unread ? '<button class="ops-btn" id="commMarkRead">Marcar como lida</button>' : ''}<button class="ops-btn" id="commLink">Salvar vínculo</button><button class="ops-btn primary" id="commCreateTask" ${email.task_id ? 'disabled' : ''}>Transformar em tarefa</button></div>
        </div>`;

      host.querySelector('#commClose')?.addEventListener('click', () => communicationModal.classList.remove('open'));
      host.querySelector('#commOpenOutlook')?.addEventListener('click', () => window.open(email.web_link, '_blank', 'noopener'));
      host.querySelector('#commMarkRead')?.addEventListener('click', async () => {
        try {
          await request(`/api/communications/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ unread: false }) });
          toast('Comunicação marcada como lida.');
          await refreshAfterCommunicationChange();
          await openCommunication(id);
        } catch (error) { toast(error.message); }
      });
      host.querySelector('#commLink')?.addEventListener('click', async () => {
        try {
          const taskId = host.querySelector('#commTask').value || null;
          await request(`/api/communications/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ taskId }) });
          toast(taskId ? 'Comunicação vinculada à tarefa.' : 'Vínculo removido.');
          await refreshAfterCommunicationChange();
          await openCommunication(id);
        } catch (error) { toast(error.message); }
      });
      host.querySelector('#commCreateTask')?.addEventListener('click', async () => {
        try {
          const result = await request(`/api/communications/${encodeURIComponent(id)}/task`, {
            method: 'POST',
            body: JSON.stringify({ priority: host.querySelector('#commPriority').value, dueDate: host.querySelector('#commDue').value || null })
          });
          toast(result.alreadyLinked ? 'A comunicação já estava vinculada.' : 'Tarefa criada a partir da comunicação.');
          await refreshAfterCommunicationChange();
          await openCommunication(id);
        } catch (error) { toast(error.message); }
      });
    } catch (error) {
      host.innerHTML = `<div class="empty">Falha ao abrir comunicação: ${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('click', (event) => {
    const row = event.target.closest('.comm-row[data-email-id]');
    if (row) openCommunication(row.dataset.emailId);
  });

  // CONFIGURAÇÕES
  let settingsState = null;
  async function loadSettings() {
    const section = document.querySelector('#settings .card');
    if (!section) return;
    section.innerHTML = '<div class="empty">Carregando configurações...</div>';
    try {
      settingsState = await request('/api/settings');
      const org = settingsState.organization || {};
      const user = settingsState.user || {};
      const env = settingsState.environment || {};
      const canEditOrg = user.role === 'admin';
      section.innerHTML = `
        <div class="head"><h2>Configurações</h2><span class="ops-badge ${env.demo ? 'warn' : 'ok'}">${env.demo ? 'PILOT DEMO' : 'PRODUÇÃO'}</span></div>
        <div style="padding:0 16px 16px" class="settings-layout">
          <div class="ops-card">
            <h3>Organização e perfil</h3><p>Dados usados na operação compartilhada do CommandDesk.</p>
            <div class="settings-form">
              <label class="full">Nome da organização<input id="setOrg" value="${esc(org.name || '')}" ${canEditOrg ? '' : 'disabled'}></label>
              <label>Seu nome<input id="setName" value="${esc(user.name || '')}"></label>
              <label>E-mail<input value="${esc(user.email || '')}" readonly></label>
              <label>Departamento<input id="setDept" value="${esc(user.department || 'Geral')}"></label>
              <label>Cargo<input id="setJob" value="${esc(user.job_title || '')}"></label>
              <label>Papel de acesso<input value="${esc(roleLabel(user.role))}" readonly></label>
              <label>ID da organização<input value="${esc(org.id || '')}" readonly></label>
              <div class="settings-save"><button class="ops-btn primary" id="saveSettings">Salvar configurações</button></div>
            </div>
          </div>
          <div class="settings-meta">
            <div class="ops-card"><div class="ops-k">Microsoft 365</div><div class="ops-v">${env.demo ? 'Sincronização em modo Demo' : env.outlookConnected ? 'Conectado' : 'Não conectado'}</div><p style="margin-top:7px">Gerencie a conexão completa no módulo Integrações.</p><div class="ops-actions"><button class="ops-btn" id="settingsGoIntegrations">Abrir Integrações</button></div></div>
            <div class="ops-card"><div class="ops-k">Permissão atual</div><div class="ops-v">${esc(roleLabel(user.role))}</div><p style="margin-top:7px">${user.role === 'admin' ? 'Pode administrar organização, integrantes e integrações.' : user.role === 'manager' ? 'Pode gerir projetos e tarefas.' : 'Pode operar tarefas e dados permitidos.'}</p></div>
            <div class="ops-card"><div class="ops-k">Persistência</div><div class="ops-v">Neon PostgreSQL</div><p style="margin-top:7px">As alterações desta tela são persistidas na organização e no perfil do usuário.</p></div>
          </div>
        </div>`;

      section.querySelector('#settingsGoIntegrations')?.addEventListener('click', () => view('integrations'));
      section.querySelector('#saveSettings')?.addEventListener('click', async () => {
        try {
          const payload = {
            name: section.querySelector('#setName').value,
            department: section.querySelector('#setDept').value,
            jobTitle: section.querySelector('#setJob').value
          };
          if (canEditOrg) payload.organizationName = section.querySelector('#setOrg').value;
          const saved = await request('/api/settings', { method: 'PATCH', body: JSON.stringify(payload) });
          settingsState = saved;
          toast('Configurações salvas.');
          if (typeof M !== 'undefined' && M) {
            M.user = { ...M.user, ...saved.user };
            M.organization = saved.organization;
          }
          const nameNode = document.querySelector('#uName');
          const roleNode = document.querySelector('#uRole');
          if (nameNode) nameNode.textContent = saved.user?.name || nameNode.textContent;
          if (roleNode) roleNode.textContent = saved.user?.job_title || roleLabel(saved.user?.role);
          await load();
          await loadSettings();
        } catch (error) { toast(error.message); }
      });
    } catch (error) {
      section.innerHTML = `<div class="empty">Falha ao carregar configurações: ${esc(error.message)}</div>`;
    }
  }

  function activateModule(viewName) {
    if (viewName === 'integrations') loadIntegrations();
    if (viewName === 'communications') renderCommunications();
    if (viewName === 'settings') loadSettings();
  }

  document.querySelectorAll('.nav button[data-v]').forEach((button) => {
    button.addEventListener('click', () => setTimeout(() => activateModule(button.dataset.v), 0));
  });

  document.querySelector('#sync2')?.addEventListener('click', () => setTimeout(() => renderCommunications(), 700));
  document.querySelector('#sync')?.addEventListener('click', () => setTimeout(() => renderCommunications(), 700));

  (async () => {
    await waitState();
    ensureCommunications();
    renderCommunications();
    const active = document.querySelector('.view.active')?.id;
    if (active) activateModule(active);
  })();

  window.CommandDeskOperations = { loadIntegrations, renderCommunications, loadSettings, openCommunication };
})();
