(() => {
  const style = document.createElement('style');
  style.textContent = `
    .rbac-readonly{opacity:.7;cursor:default!important}.rbac-note{font-size:8px;color:#8a8f96;margin-top:5px}.rbac-lock{font-size:8px;color:#a45d22;font-weight:800}
    #tenantBindingCard{margin:0 0 12px;border-left:3px solid #ff6b19}
  `;
  document.head.appendChild(style);

  const has = (me, permission) => Array.isArray(me?.permissions) && me.permissions.includes(permission);
  let me = null;
  let tenantLoadInFlight = false;

  async function getMe() {
    const response = await fetch('/api/me', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function hide(selector, hidden = true) {
    document.querySelectorAll(selector).forEach((el) => { el.style.display = hidden ? 'none' : ''; });
  }

  function applyNavigation() {
    hide('.nav button[data-v="executive"]', !has(me, 'executive:view'));
    hide('#newProject', !has(me, 'projects:manage'));
    hide('#newTeamMember', !has(me, 'team:manage'));
  }

  function protectProjectRows() {
    if (has(me, 'projects:manage')) return;
    document.querySelectorAll('#projectTable tr,#projectsSide .row').forEach((row) => row.classList.add('rbac-readonly'));
  }

  function protectTaskModal() {
    const owner = document.querySelector('#fOwner');
    if (!owner || me?.user?.role !== 'member') return;
    owner.value = me.user.id;
    owner.disabled = true;
    if (!owner.parentElement?.querySelector('.rbac-note')) {
      const note = document.createElement('div');
      note.className = 'rbac-note';
      note.textContent = 'Membros criam e mantêm tarefas atribuídas a si próprios.';
      owner.insertAdjacentElement('afterend', note);
    }
  }

  function patchTaskOpeners() {
    const originalOpen = window.openTask;
    if (typeof originalOpen === 'function' && !originalOpen.__rbacWrapped) {
      const wrapped = function(...args) {
        const result = originalOpen.apply(this, args);
        setTimeout(protectTaskModal, 0);
        return result;
      };
      wrapped.__rbacWrapped = true;
      window.openTask = wrapped;
    }

    const originalEdit = window.editTask;
    if (typeof originalEdit === 'function' && !originalEdit.__rbacWrapped) {
      const wrapped = function(id, ...args) {
        const task = (window.S || S)?.tasks?.find((item) => item.id === id);
        const result = originalEdit.call(this, id, ...args);
        setTimeout(() => {
          protectTaskModal();
          if (me?.user?.role === 'member' && task && task.owner_id !== me.user.id) {
            document.querySelectorAll('#modal input,#modal select,#modal textarea').forEach((field) => field.disabled = true);
            const save = document.querySelector('#save');
            if (save) save.style.display = 'none';
            const title = document.querySelector('#modalTitle');
            if (title) title.textContent = 'Consultar tarefa';
          } else {
            const save = document.querySelector('#save');
            if (save) save.style.display = '';
          }
        }, 0);
        return result;
      };
      wrapped.__rbacWrapped = true;
      window.editTask = wrapped;
    }
  }

  function protectEntityActions() {
    if (!window.CommandDeskEntities || window.CommandDeskEntities.__rbacWrapped) return;
    const originalProject = window.CommandDeskEntities.openProject;
    const originalTeam = window.CommandDeskEntities.openTeamMember;
    window.CommandDeskEntities.openProject = (project = null) => {
      if (!has(me, 'projects:manage')) {
        if (project) toast('Seu perfil possui acesso de consulta a Projetos.');
        else toast('Seu perfil não pode criar projetos.');
        return;
      }
      return originalProject(project);
    };
    window.CommandDeskEntities.openTeamMember = () => {
      if (!has(me, 'team:manage')) return toast('Somente administradores podem gerenciar o Time.');
      return originalTeam();
    };
    window.CommandDeskEntities.__rbacWrapped = true;
  }

  function tenantCardSkeleton(host) {
    let card = host.querySelector('#tenantBindingCard');
    if (card) return card;
    card = document.createElement('div');
    card.className = 'ops-card';
    card.id = 'tenantBindingCard';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <h3>Tenant Microsoft</h3><span class="ops-badge warn">ADMIN</span>
      </div>
      <p id="tenantBindingText">Verificando vínculo corporativo...</p>
      <div class="ops-k">Organização</div><div class="ops-v">Microsoft Entra / Microsoft 365</div>
      <div class="ops-actions"><button class="ops-btn primary" id="rbacBindTenant" disabled>Vincular tenant Microsoft</button></div>
      <div class="rbac-note" id="tenantBindingNote">Carregando estado da integração.</div>`;
    host.prepend(card);
    return card;
  }

  function enhanceTenantBinding() {
    const host = document.querySelector('#integration');
    if (!host || !me || me.user?.role !== 'admin') return;

    const card = tenantCardSkeleton(host);
    if (tenantLoadInFlight || card.dataset.loaded === '1') return;
    tenantLoadInFlight = true;

    fetch('/api/integrations', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const button = card.querySelector('#rbacBindTenant');
        const text = card.querySelector('#tenantBindingText');
        const note = card.querySelector('#tenantBindingNote');
        if (!ok || !data?.microsoft) {
          if (text) text.textContent = 'Não foi possível consultar o estado do Microsoft 365.';
          if (note) note.textContent = 'Recarregue a página. Se persistir, verifique /api/integrations.';
          return;
        }

        const ms = data.microsoft;
        if (button) {
          button.textContent = ms.tenantLinked ? 'Revalidar tenant Microsoft' : 'Vincular tenant Microsoft';
          button.disabled = !ms.bindReady;
          button.onclick = ms.bindReady ? () => { location.href = '/api/integrations/microsoft/bind'; } : null;
        }
        if (text) text.textContent = ms.tenantLinked
          ? 'Tenant corporativo vinculado à organização atual.'
          : 'O tenant corporativo ainda precisa ser vinculado à organização.';
        if (note) {
          if (ms.bindReady) {
            note.textContent = ms.tenantLinked
              ? 'OAuth Microsoft pronto. Você pode revalidar o vínculo.'
              : 'OAuth Microsoft pronto. Clique para autenticar e vincular o tenant.';
          } else {
            note.textContent = 'A opção está visível, mas o OAuth ainda não está pronto. Configure MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET e APP_URL no ambiente de produção.';
          }
        }
        card.dataset.loaded = '1';
      })
      .catch((error) => {
        const text = card.querySelector('#tenantBindingText');
        const note = card.querySelector('#tenantBindingNote');
        if (text) text.textContent = 'Falha ao consultar o vínculo Microsoft.';
        if (note) note.textContent = error.message || 'Erro ao consultar a integração.';
      })
      .finally(() => { tenantLoadInFlight = false; });
  }

  function observe() {
    const observer = new MutationObserver(() => {
      applyNavigation();
      protectProjectRows();
      protectEntityActions();
      enhanceTenantBinding();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function start() {
    try {
      me = await getMe();
      window.CommandDeskAccess = me;
      applyNavigation();
      protectProjectRows();
      patchTaskOpeners();
      protectEntityActions();
      enhanceTenantBinding();
      observe();
    } catch (error) {
      console.warn('RBAC UI indisponível:', error.message);
    }
  }

  start();
})();
